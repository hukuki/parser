const { Parser } = require('./parser.js');
const Document = require('../model/document.js');
const File = require('../model/file.js');
const bucket = require('../s3/s3.js');
const connection = require('../model/db.js');
const { MevzuatTransformer } = require('./transformer.js');

class MevzuatParser extends Parser {
    constructor(sourceFolder, targetMdFolder, targetJsonFolder) {
        super(sourceFolder, targetMdFolder, targetJsonFolder, new MevzuatTransformer());
        this.levelStack = [];
    }

    queryFiles(skip=0, limit=1000) {
        const cursor = Document.aggregate(
            [ { $skip: skip}, { $limit : limit }, { '$lookup': { 'from': 'files', 'let': { 'doc_id': '$_id', 'docLastUpdated': '$sourceLastUpdated' }, 'pipeline': [ { '$match': { '$expr': { '$and': [ { '$eq': [ '$document', '$$doc_id' ] }, { '$eq': [ '$sourceLastUpdated', '$$docLastUpdated' ] } ] } } }, { '$addFields': { 'priority': { '$switch': { 'branches': [ { 'case': { '$eq': [ '$contentType', 'text/html; charset=utf-8' ] }, 'then': 1 }, { 'case': { '$eq': [ '$contentType', 'application/msword' ] }, 'then': 2 }, { 'case': { '$eq': [ '$contentType', 'application/pdf' ] }, 'then': 3 } ], 'default': 4 } } } }, { '$sort': { 'priority': 1 } } ], 'as': 'files' } }, { '$set': { 'file': { '$first': '$files' } } }, { '$replaceRoot': { 'newRoot': { '$ifNull': [ '$file', { '_id': null } ] } } } ]
            //[{'$lookup':{'from':'files','let':{'doc_id':'$_id','docLastUpdated':'$sourceLastUpdated'},'pipeline':[{'$match':{'$expr':{'$and':[{'$eq':['$document','$$doc_id']},{'$eq':['$sourceLastUpdated','$$docLastUpdated']}]}}},{'$addFields':{'priority':{'$switch':{'branches':[{'case':{'$eq':['$contentType','text/html; charset=utf-8']},'then':1},{'case':{'$eq':['$contentType','application/msword']},'then':2},{'case':{'$eq':['$contentType','application/pdf']},'then':3}],'default':4}}}},{'$sort':{'priority':1}}],'as':'files'}},{'$set':{'file':{'$first':'$files'}}},{'$replaceRoot':{'newRoot':'$file'}}]
        ).option({maxTimeMS: 1000*60*60*3}).cursor({ batchSize: this.batchSize});
        return cursor  
    }

    querySpecificFile(documentId) {
        const cursor = File.aggregate(
            [{'$match':{'document':documentId}}]
        ).cursor({ batchSize: this.batchSize});
        return cursor
    }

    parseToJSON(mdFile) {
        this.result = []
        this.levelStack = [];
        this.currentParent = this.result;
        const rawlines = mdFile.split('\n');

        // convert the paragraphs into one line
        const lines = this.convertParagraphsToLines(rawlines);

        for (const line of lines) {
            if(this.maddeParser(line)) continue;
            if(this.headerParser(line)) continue;
            if(this.tableParser(line)) continue;
            if(this.lineParser(line)) continue;
        }
        return this.result;
    }

    maddeParser(line){
        const maddeRegex = /^[  ]*\*\*[^\*]*madde\s*\d+[^\*]*\*\*/gi; // /^\*\*.*madde\s*\d+.*\*\*/gi;
        
        if (line.match(maddeRegex)) {
            const maddeStr = line.match(maddeRegex)[0].replace(/\*\*/g, '').trim();
            const maddeNumber = Number(maddeStr.match(/\d+/)[0]);
            const maddeContent = line.replace(line.match(maddeRegex)[0], '').trim();
            
            const {altMaddeClass, altMaddeTitle} = this.altMaddeClasses(maddeContent);
            //console.log(altMaddeClass, altMaddeTitle);
            if(altMaddeClass !== null){
                const altMadde = {type : "text", content : maddeContent, subsections : [], altMaddeClass, altMaddeTitle};
                this.levelStack = [altMaddeClass];
                this.result.push({type : "madde", maddeStr: maddeStr, number : maddeNumber, content : '', subsections : [altMadde]});
            }
            else {
                this.result.push({type : "madde", maddeStr: maddeStr, number : maddeNumber, content : maddeContent, subsections : []});
                this.levelStack = []; 
            }
            this.currentParent = this.result[this.result.length-1];
            return true     
        }

        return false
    }

    headerParser(line){
        const headerRegex = /^[  ]*\*\*(?=.*\w)[^\n]*\*\*$/i;

        if (line.match(headerRegex)) {
            const header = line.replace(/\*\*/g, '').trim();
            this.result.push({type : "header", content : header});
            this.currentParent = this.result;
            return true
        }
        
        return false
    }

    tableParser(line){
        const tableStartRegex = /^<table>/gi;
        const tableEndRegex = /<\/table>/gi;
        if (line.match(tableStartRegex) && line.match(tableEndRegex)) {
            if(this.currentParent.type === "madde" || this.currentParent.type === "text"){
                this.currentParent.subsections.push({type : "table", content : line, subsections : []});
            }
            else{
                this.result.push({type : "table", content : line, subsections : []});
            }
            return true
        }
        return false
    }

    lineParser(line){
        const nonemptyLineRegex = /^(?=.*\w).*$/gi;
        if (line.match(nonemptyLineRegex)) {
            const {altMaddeClass, altMaddeTitle} = this.altMaddeClasses(line);
            
            if (this.currentParent.type !== "madde" && this.currentParent.type !== "text") {
                this.result.push({type : "freeText", content : line});
                return true
            }

            if(altMaddeClass !== null && !this.levelStack.includes(altMaddeClass) && this.currentParent.subsections.length > 0){
                this.currentParent = this.currentParent.subsections[this.currentParent.subsections.length-1];
                this.currentParent.subsections.push({type : "text", content : line, subsections : [], altMaddeClass, altMaddeTitle});
                this.levelStack.push(altMaddeClass);
                return true
            }
            
            if (altMaddeClass !== null && !this.levelStack.includes(altMaddeClass)){
                this.currentParent.subsections.push({type : "text", content : line, subsections : [], altMaddeClass, altMaddeTitle});
                this.levelStack.push(altMaddeClass);
                return true
            }

            if (altMaddeClass !== null && this.levelStack.includes(altMaddeClass)){
                //console.log(this.currentParent)
                while (this.levelStack[this.levelStack.length-1] !== altMaddeClass) {
                    this.levelStack.pop();
                    this.currentParent = this.getParent(this.result, this.getParent(this.result, this.currentParent));
                }
                //console.log(this.currentParent);
                this.currentParent.subsections.push({type : "text", content : line, subsections : [], altMaddeClass, altMaddeTitle});
                return true
            }

            this.currentParent.subsections.push({type : "text", content : line, subsections : []});
            return true
        }
        return false
    }

    altMaddeClasses(line){
        const altMaddeRegex = [
            [/^[^\wığüşöç]*\(\d+\\*\)/], // (1), (2), (3) etc.
            [/^[^\wığüşöç(]*[a-zığüşöç]\\*\)/], // a), b\\), c) etc.
            [/^[^\wığüşöç(]*\d+\\*\)/], // 1), 2), 3) etc.
            [/^[^\wığüşöç(]*[a-zığüşöç][a-zığüşöç]\\*\)/], // aa), bb), cc) etc.
            [/^[^\wığüşöç]*\([a-zığüşöç]\\*\)/], // (a), (b\\), (c) etc.
            [/^[^\wığüşöç]*\([a-zığüşöç][a-zığüşöç]\\*\)/] // (aa), (bb), (cc) etc.
        ]

        for (const [index, regexClass] of altMaddeRegex.entries()) {
            for (const regex of regexClass) {
                if (line.match(regex)) {
                    return {altMaddeClass : index, altMaddeTitle : line.match(regex)[0]}
                }
            }
        }
        return{altMaddeClass : null, altMaddeTitle : null}     
    }

    convertParagraphsToLines(rawlines) {
        const lines = []
        let newLine = true
        for (const line of rawlines) {
            if (newLine) {
                lines.push(line);
                newLine = false;
            }
            else if (line === '') { newLine = true; }
            else { lines[lines.length - 1] += " " + line; }
        }

        //remove unbreakable spaces
        for (const [index, line] of lines.entries()) {
            lines[index] = line.replace(/ /g, ' ');
        }
        return lines;
    }

    getParent(root, child) {
        if (root===child) {return root}
        for (const property in root) {
            if (root[property]===child) {return root}
            if (typeof root[property]==='object') {
                const result = this.getParent(root[property], child);
                if (result) {return result}
            }
        }
        return null;
    }

    async uploadTransformedFile(file, mdFile) {
        await bucket.uploadFile(this.targetMdFolder + '/' + file.document + '.md', mdFile);
    }

    async uploadJsonFile(file, jsonFile) {
        await bucket.uploadFile(this.targetJsonFolder + '/' + file.document._id + '.json', jsonFile);
    }
}

module.exports = { MevzuatParser };