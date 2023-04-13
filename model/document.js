require('./db.js');

const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
    name: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    folder: {
        type: String,
        required: true
    },
    sourceLastUpdated: {
        type: Date
    }
}, { timestamps: true} );

documentSchema.method("getLatestVersion", function(fileModel) {
    return fileModel.find({name: this.name, sourceLastUpdated: this.sourceLastUpdated});
});

const Document = mongoose.model("Document", documentSchema);

module.exports = Document;