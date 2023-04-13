const fs = require('fs');

class Parser {
    constructor(source_folder, target_folder) {
        this.source_folder = source_folder;
        this.target_folder = target_folder;
        this.batchSize = 50;
    }

    queryFiles() { return Promise() }

    async transformFile(file) { return Promise() }

    async uploadTransformedFile(file, mdFile) { return Promise() }

    parseToJson(mdFile) { return {} }

    async uploadJson(json) { return Promise() }

    async parse() {
        const fileQuery = this.queryFiles();
        console.log(fileQuery);
        
        await fileQuery.eachAsync(async (file) => {
            const mdFile = await this.transformFile(file);
            await this.uploadTransformedFile(file, mdFile);
            const json = this.parseToJson(mdFile);

            const jsonFile = JSON.stringify(json);
            // save json file
            fs.promises.writeFile('tmp/' + file.document._id + '.json', jsonFile);
            // await this.uploadJson(json);
        }, { parallel: 10 });  
    }

}

module.exports = { Parser };