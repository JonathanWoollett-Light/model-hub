const bcrypt = require('bcrypt') // hashing
const SALT = require('./server').SALT;

async function seed(db) {
    // Seeds users
    await Promise.all([
        db.collection("users").insertOne({
            email: "a@a",
            hash: await bcrypt.hash("a",SALT),
            models: [],
            views: [],
            offers: [],
            invites: [],
            memory: 0,
            stars: [],
            masonry: true,
            ownGroups: [],
            viewGroups: []
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "b@b",
            hash: await bcrypt.hash("b",SALT),
            models: [],
            views: [],
            offers: [],
            invites: [],
            memory: 0,
            stars: [],
            masonry: true,
            ownGroups: [],
            viewGroups: []
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "c@c",
            hash: await bcrypt.hash("c",SALT),
            models: [],
            views: [],
            offers: [],
            invites: [],
            memory: 0,
            stars: [],
            masonry: true,
            ownGroups: [],
            viewGroups: []
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "d@d",
            hash: await bcrypt.hash("d",SALT),
            models: [],
            views: [],
            offers: [],
            invites: [],
            memory: 0,
            stars: [],
            masonry: true,
            ownGroups: [],
            viewGroups: []
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "aa@a",
            hash: await bcrypt.hash("aa",SALT),
            models: [],
            views: [],
            offers: [],
            invites: [],
            memory: 0,
            stars: [],
            masonry: true,
            ownGroups: [],
            viewGroups: []
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "ab@a",
            hash: await bcrypt.hash("ab",SALT),
            models: [],
            views: [],
            offers: [],
            invites: [],
            memory: 0,
            stars: [],
            masonry: true,
            ownGroups: [],
            viewGroups: []
        }).catch((err)=>{}),
        db.collection("users").insertOne({
            email: "ac@a",
            hash: await bcrypt.hash("ac",SALT),
            models: [],
            views: [],
            offers: [],
            invites: [],
            memory: 0,
            stars: [],
            masonry: true,
            ownGroups: [],
            viewGroups: []
        }).catch((err)=>{})
    ])
}

module.exports = seed;