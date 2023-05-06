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
    parseToJSON(mdFile) { }

    async parse() {
        const fileQuery = this.queryFiles();
        //const fileQuery = this.querySpecificFile('64486291e0b1ea631de96879');
        
        await fileQuery.eachAsync(async (file) => {
            
            // Skip if file is already parsed for debugging purposes
            if(fs.existsSync('tmp/' + file.document._id + '.json')) {
                console.log('File already exists: ' + file._id + ' ' + file.contentType + ' ' + file.metadata.mevAdi);
                return;
            }
            
            const fileData = await bucket.getFile(this.sourceFolder + '/' + file._id);
            const mdFile = await this.transformer.transform(file, fileData);
            
            if (mdFile === null || mdFile === undefined) {
                console.log('File could not be transformed: ' + file._id + ' ' + file.contentType + ' ' + file.metadata.mevAdi);
                return;
            }
            const json = this.parseToJSON(mdFile);
            const jsonFile = JSON.stringify(json);
            //console.log('Json', json)
            fs.promises.writeFile('tmp/' + file.document._id + '.json', jsonFile);
            
            // await this.uploadJsonFile(file, jsonFile);
        }, { parallel: 10 });  

        console.log('Done');
    }

}

module.exports = { Parser };