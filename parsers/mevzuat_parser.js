const { Parser } = require('./parser.js');
const Document = require('../model/document.js');
const File = require('../model/file.js');
const { uploadFile, getFile } = require('../s3/s3.js');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

class MevzuatParser extends Parser {
    constructor(source_folder, target_md_folder, target_json_folder) {
        super(source_folder, target_md_folder, target_json_folder);
    }

    queryFiles() {
        const cursor = File.aggregate([
            {
                $lookup: {
                    from: "documents",
                    localField: "document",
                    foreignField: "_id",
                    as: "document"
                }
            },
            {
                $unwind: "$document"
            },
            {
                $match: {
                    $expr: {
                        $eq: ["$sourceLastUpdated", "$document.sourceLastUpdated"]
                    }
                }
            },
            {
                $addFields: {
                    priority: {
                        $switch: {
                            branches: [
                                {
                                    case: { $eq: [ "$contentType", "text/html; charset=utf-8" ] },
                                    then: 1
                                },
                                {
                                    case: { $eq: [ "$contentType", "application/msword" ] },
                                    then: 2
                                },
                                {
                                    case: { $eq: [ "$contentType", "application/pdf" ] },
                                    then: 3
                                }
                            ],
                            default: 4
                        }
                    }
                }
            },
            {
                $sort: {
                    "priority": 1,
                    "createdAt": -1
                }
            },
            {
                $group: {
                    _id: "$document._id",
                    file: {
                        $first: "$$ROOT"
                    }
                }
            },
            {
                $replaceRoot: {
                    newRoot: "$file"
                }
            }
        ]).cursor({ batchSize: this.batchSize});
        return cursor  
    }

    async transformFile(file) {
        const fileData = await getFile(this.source_folder + '/' + file._id)
        if (file.contentType === 'text/html; charset=utf-8') {
            await this.transformHtml(file, fileData);
        }

        const mdFile = await fs.promises.readFile('tmp/' + file.document._id + '.md', { encoding : 'utf-8'});
        await fs.promises.rm('tmp/' + file.document._id + '.md');
        return mdFile;
    }

    async uploadTransformedFile(file, mdFile) {
        await uploadFile(this.target_md_folder + '/' + file.document._id + '.md', mdFile);
    }

    parseToJson(mdFile) {
        const resultJson = []
        const rawLines = mdFile.split('\n');

        // convert the paragraphs into one line
        const Lines = []
        let newLine = true
        for (const line of rawLines) {
            if (newLine) {
                Lines.push(line);
                newLine = false;
            }
            else if (line === '') {
                newLine = true;
            }
            else {
                Lines[Lines.length - 1] += " " + line;
            }
        }

        // Define regex patterns for headers, "madde" elements, and non-empty lines.
        const headerRegex = /^\*\*(?=.*\w)[^\n]*\*\*$/i;
        const maddeRegex = /^\*\*.*madde\s*\d+.*\*\*/gi;
        const nonemptyLineRegex = /^(?=.*\w).*$/gi;
        const tableStartRegex = /^<table>/gi;
        const tableEndRegex = /<\/table>/gi;

        let tableFlag = false;

        for (const line of Lines) {
            // Check if the line matches the header regex.
            if (line.match(headerRegex)) {
                const header = line.replace(/\*\*/g, '').trim();
                resultJson.push({type : "header", content : header});
            } 
            // Check if the line matches the "madde" regex.
            else if (line.match(maddeRegex)) {
                const maddeStr = line.match(maddeRegex)[0].replace(/\*\*/g, '').trim();
                const maddeNumber = Number(maddeStr.match(/\d+/)[0]);
                const maddeContent = line.replace(line.match(maddeRegex)[0], '').trim();
                resultJson.push({type : "madde", maddeStr: maddeStr, number : maddeNumber, content : maddeContent, subsections : []});      
            } 
            // Check if the line matches the table start regex, also end it immediately if it matches the table end regex.
            else if (line.match(tableStartRegex)) {
                tableFlag = true;
                resultJson.push({type : "table", content : line});
                if (line.match(tableEndRegex)) {
                    tableFlag = false;
                }
            }
            // Check if the line matches the table end regex.
            else if (line.match(tableEndRegex) && tableFlag) {
                tableFlag = false;
                resultJson[resultJson.length - 1].content += line;
            }
            // Check if the line matches the non-empty line regex.
            else if (line.match(nonemptyLineRegex)) {
                // If the previous object in the JSON structure is of type "table", add the content
                if (tableFlag) {
                    resultJson[resultJson.length - 1].content += line;
                }
                // If the previous object in the JSON structure is of type "madde", add the content
                // as a "text" object in its subsections.
                else if (resultJson.length > 0 && resultJson[resultJson.length - 1].type === "madde") {
                    resultJson[resultJson.length - 1].subsections.push({type : "text", content : line});
                }
                // Otherwise, add the content as a "freeText" object in the JSON structure.
                else {
                    resultJson.push({type : "freeText", content : line});
                }
            }
        }

        return resultJson;
    }

    async uploadJsonFile(file, jsonFile) {
        await uploadFile(this.target_json_folder + '/' + file.document._id + '.json', jsonFile);
    }

    async transformHtml(file, buffer) {
        try {
            await fs.promises.writeFile('tmp/' + file.document._id + '.html', buffer);
            const docx_out = await exec('pandoc -f html -t docx -o tmp/' + file.document._id + '.docx tmp/' + file.document._id + '.html');
            docx_out.stdout === '' ? '' : console.log('stdout:', docx_out.stdout);
            docx_out.stderr === '' ? '' : console.log('stderr:', docx_out.stderr);
            const md_out = await exec('pandoc -f docx -t commonmark -o tmp/' + file.document._id + '.md tmp/' + file.document._id + '.docx');
            docx_out.stdout === '' ? '' : console.log('stdout:', md_out.stdout);
            docx_out.stderr === '' ? '' : console.log('stderr:', md_out.stderr);
            await fs.promises.rm('tmp/' + file.document._id + '.html');
            await fs.promises.rm('tmp/' + file.document._id + '.docx');
        } catch (err) {
            console.error(err);
        }
    }
} 

module.exports = { MevzuatParser };