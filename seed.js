const bcrypt = require('bcrypt') // hashing
const SALT = require('./server').SALT;

async function seed(db) {
    // Seeds users
    await Promise.all([
        db.collection("users").insertOne({
            email: "a@a",
            hash: await bcrypt.hash("a",SALT),
            models: [],
            offers: [],
            memory: 0
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "b@b",
            hash: await bcrypt.hash("b",SALT),
            models: [],
            offers: [],
            memory: 0
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "c@c",
            hash: await bcrypt.hash("c",SALT),
            models: [],
            offers: [],
            memory: 0
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "d@d",
            hash: await bcrypt.hash("d",SALT),
            models: [],
            offers: [],
            memory: 0
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "aa@a",
            hash: await bcrypt.hash("aa",SALT),
            models: [],
            offers: [],
            memory: 0
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "ab@a",
            hash: await bcrypt.hash("ab",SALT),
            models: [],
            offers: [],
            memory: 0
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "ac@a",
            hash: await bcrypt.hash("ac",SALT),
            models: [],
            offers: [],
            memory: 0
        }).catch((err)=>{})
    ])
}

module.exports = seed;