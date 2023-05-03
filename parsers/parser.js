const fs = require('fs');
const { IdentityTransformer } = require('./transformer');
const bucket = require('../s3/s3');

/*
    * This is the base class for all parsers.
    * It is responsible for:
    * - Querying the database for files
    * - Transforming the files to JSON tree using its transformer
    * - Uploading the transformed files
*/
class Parser {
    constructor(
        sourceFolder,
        targetMdFolder,
        targetJsonFolder,
        transformer = undefined
        ) {
        this.sourceFolder = sourceFolder;
        this.targetMdFolder = targetMdFolder;
        this.targetJsonFolder = targetJsonFolder;
        this.batchSize = 50;

        this.transformer = transformer || new IdentityTransformer();
    }

    async queryFiles() { }

    async parse() {
        const files = await this.queryFiles();

        const allJson = [];

        for (let file of files) {
            const fileData = await bucket.getFile(this.sourceFolder + '/' + file._id);
            const json = await this.transformer.transform(file, fileData);

            allJson.push(json);
            //await bucket.uploadFile(file, mdFile);
            //const json = this.parseToJson(mdFile);
            //const jsonFile = JSON.stringify(json);
            // fs.promises.writeFile('tmp/' + file.document._id + '.json', jsonFile);
            //await bucket.uploadFile(file, jsonFile);
        };
        
        console.log(JSON.stringify(allJson));
    }

}

module.exports = { Parser };