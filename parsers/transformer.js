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
            //await fs.rm('tmp/' + file.document + '.md');
            
            return mdFile;
        } catch (err) {
            console.error(err);
        }
    }
}

class MevzuatTransformer {

    constructor() { }

    async transform(file, buffer) {
        if (file.contentType == "text/html; charset=utf-8") {
            const transformer = new HTML2MDTransformer();
            const mdFile = await transformer.transform(file, buffer);
            return mdFile;
        }
        else if (file.contentType == "application/msword") {
            //TODO: implement
            return null
        }
        else if (file.contentType == "application/pdf") {
            //TODO: implement
            return null
        }
    }
}
           
module.exports = {HTML2MDTransformer, IdentityTransformer, MevzuatTransformer}