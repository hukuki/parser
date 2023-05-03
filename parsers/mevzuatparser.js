const { Parser } = require('./parser.js');
const Document = require('../model/document.js');
const File = require('../model/file.js');
const bucket = require('../s3/s3.js');
const { MevzuatTransformer } = require('./transformer.js');

class MevzuatParser extends Parser {
    constructor(sourceFolder, targetMdFolder, targetJsonFolder) {
        super(sourceFolder, targetMdFolder, targetJsonFolder, new MevzuatTransformer());
    }

    async queryFiles() {
        const files = await File.find({ 
            contentType: 'text/html; charset=utf-8' 
        }, 
        //Fields to retrieve:
        ['_id', 'document', 'contentType']
        )
        //For debugging purposes, limit the number of files to be parsed.
        .limit(10);

        return files;
    }

    // This function is not necessary.
    async uploadTransformedFile(file, mdFile) {
        await bucket.uploadFile(this.targetMdFolder + '/' + file.document + '.md', mdFile);
    }

    async uploadJsonFile(file, jsonFile) {
        await uploadFile(this.targetJsonFolder + '/' + file.document._id + '.json', jsonFile);
    }
}

module.exports = { MevzuatParser };