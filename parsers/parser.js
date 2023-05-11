const fs = require('fs');
const { IdentityTransformer } = require('./transformer');
const bucket = require('../s3/s3');
const connection = require('../model/db');
const Document = require('../model/document');
const { cursorTo } = require('readline');

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
    parseToJSON(mdFile) { }

    async parse() {
        const limit = 1000;
        let current = 0;
        let fileQuery = this.queryFiles(current, limit);

        const documentCount = await Document.find().count();
        while (current <= (documentCount + limit)) {

            console.log('Current: ' + current);

            try {
                await fileQuery.eachAsync(async (file) => {

                    //Skip if file is empty
                    if(file._id == null) {
                        //console.log('File is empty');
                        return;
                    }
                    
                    // Skip if file is already parsed for debugging purposes
                    if(fs.existsSync('tmp/' + file.document._id + '.json')) {
                        console.log('File already exists: ' + file._id + ' ' + file.contentType + ' ' + file.metadata.mevAdi);
                        return;
                    }
                    
                    // Skip if file is pdf for debugging purposes
                    if(file.contentType == "application/pdf") {
                        console.log('File is pdf: ' + file._id + ' ' + file.contentType + ' ' + file.metadata.mevAdi);
                        return;
                    }
                    
                    const fileData = await bucket.getFile(this.sourceFolder + '/' + file._id);
                    const mdFile = await this.transformer.transform(file, fileData);
                    
                    if (mdFile === null || mdFile === undefined) {
                        console.log('File could not be transformed: ' + file._id + ' ' + file.contentType + ' ' + file.metadata.mevAdi);
                        return;
                    }
                    const jsonContent = this.parseToJSON(mdFile);
                    const json = { metadata: file.metadata, content: jsonContent };
                    const jsonFile = JSON.stringify(json);
                    //console.log('Json', json)
                    //fs.promises.writeFile('tmp/' + file.document._id + '.json', jsonFile);
                    
                    await this.uploadTransformedFile(file, mdFile);
                    await this.uploadJsonFile(file, jsonFile);
                }, { parallel: 10 }); 
            } catch (err) {
                console.log(err);
            }
            
            fileQuery.close();
    
            current += limit;
            fileQuery = this.queryFiles(current, limit);
        }
        console.log('Done');
    }

}

module.exports = { Parser };