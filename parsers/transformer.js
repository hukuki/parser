const fs = require('fs').promises;
const util = require('util');
const exec = util.promisify(require('child_process').exec);

class IdentityTransformer {
    constructor() { }

    async transform(file, buffer) {
        return buffer;
    }
}

class HTML2MDTransformer {
    constructor() { }

    async transform(file, buffer) {
        try {
            await fs.writeFile('tmp/' + file.document._id + '.html', buffer);
            
            const docxOut = await exec('pandoc -f html -t docx -o tmp/' + file.document._id + '.docx tmp/' + file.document._id + '.html');
            
            docxOut.stdout === '' ? '' : console.log('stdout:', docxOut.stdout);
            docxOut.stderr === '' ? '' : console.log('stderr:', docxOut.stderr);
            
            const mdOut = await exec('pandoc -f docx -t commonmark -o tmp/' + file.document._id + '.md tmp/' + file.document._id + '.docx');
            
            mdOut.stdout === '' ? '' : console.log('stdout:', mdOut.stdout);
            mdOut.stderr === '' ? '' : console.log('stderr:', mdOut.stderr);
            
            await fs.rm('tmp/' + file.document._id + '.html');
            await fs.rm('tmp/' + file.document._id + '.docx');
            
            const mdFile = await fs.readFile('tmp/' + file.document + '.md', { encoding : 'utf-8'});
            await fs.rm('tmp/' + file.document + '.md');
            
            return mdFile;
        } catch (err) {
            console.error(err);
        }
    }
}

class MD2JsonTransformer {
    constructor() { }

    async transform(mdFile) {
        const result = []
        const rawlines = mdFile.split('\n');

        // convert the paragraphs into one line
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

        // Define regex patterns for headers, "madde" elements, and non-empty lines.
        const headerRegex = /^\*\*(?=.*\w)[^\n]*\*\*$/i;
        const maddeRegex = /^\*\*.*madde\s*\d+.*\*\*/gi;
        const nonemptyLineRegex = /^(?=.*\w).*$/gi;
        const tableStartRegex = /^<table>/gi;
        const tableEndRegex = /<\/table>/gi;
        const altmaddeRegex = /^\*\*.*\(.*\)\s*\d+.*\*\*/gi;

        let tableFlag = false;

        for (const line of lines) {
            // Check if the line matches the header regex.
            if (line.match(maddeRegex)) {
                const maddeStr = line.match(maddeRegex)[0].replace(/\*\*/g, '').trim();
                const maddeNumber = Number(maddeStr.match(/\d+/)[0]);
                const maddeContent = line.replace(line.match(maddeRegex)[0], '').trim();
                
                // match subsections of madde
                result.push({type : "madde", maddeStr: maddeStr, number : maddeNumber, content : maddeContent, subsections : []});      
            } 
            
            else if (line.match(headerRegex)) {
                const header = line.replace(/\*\*/g, '').trim();
                result.push({type : "header", content : header});
            } 
            // Check if the line matches the table start regex, also end it immediately if it matches the table end regex.
            else if (line.match(tableStartRegex)) {
                tableFlag = true;
                result.push({type : "table", content : line});
                if (line.match(tableEndRegex)) {
                    tableFlag = false;
                }
            }
            // Check if the line matches the table end regex.
            else if (line.match(tableEndRegex) && tableFlag) {
                tableFlag = false;
                result[result.length - 1].content += line;
            }
            // Check if the line matches the non-empty line regex.
            else if (line.match(nonemptyLineRegex)) {
                // If the previous object in the JSON structure is of type "table", add the content
                if (tableFlag) {
                    result[result.length - 1].content += line;
                }
                // If the previous object in the JSON structure is of type "madde", add the content
                // as a "text" object in its subsections.
                else if (result.length > 0 && result[result.length - 1].type === "madde" &&
                    line.match(altmaddeRegex)        
                ) {
                    
                    result[result.length - 1].subsections.push({type : "text", content : line});
                
                }
                // Otherwise, add the content as a "freeText" object in the JSON structure.
                else {
                    result.push({type : "freeText", content : line});
                }
            }
        }

        return result;
    }
}

class MevzuatTransformer {

    constructor() { }

    async transform(file, buffer) {
        const transformer = new HTML2MDTransformer();
        const mdFile = await transformer.transform(file, buffer);
        
        const jsonTransformer = new MD2JsonTransformer();
        return await jsonTransformer.transform(mdFile);
    }
}
           
module.exports = {HTML2MDTransformer, IdentityTransformer, MD2JsonTransformer, MevzuatTransformer}