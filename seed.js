const bcrypt = require('bcrypt') // hashing
const SALT = require('./server').SALT;

async function seed(db) {
    // Seeds users
    await Promise.all([
        db.collection("users").insertOne({
            email: "a@a",
            hash: bcrypt.hash("a",SALT),
            models: [],
            offers: []
        }),
        db.collection("users").insertOne({
            email: "b@b",
            hash: bcrypt.hash("b",SALT),
            models: [],
            offers: []
        }),
        db.collection("users").insertOne({
            email: "c@c",
            hash: bcrypt.hash("c",SALT),
            models: [],
            offers: []
        }),
        db.collection("users").insertOne({
            email: "d@d",
            hash: bcrypt.hash("d",SALT),
            models: [],
            offers: []
        }),
        db.collection("users").insertOne({
            email: "aa@a",
            hash: bcrypt.hash("aa",SALT),
            models: [],
            offers: []
        }),
        db.collection("users").insertOne({
            email: "ab@a",
            hash: bcrypt.hash("ab",SALT),
            models: [],
            offers: []
        }),
        db.collection("users").insertOne({
            email: "ac@a",
            hash: bcrypt.hash("ac",SALT),
            models: [],
            offers: []
        })
    ])
}

module.exports = seed;