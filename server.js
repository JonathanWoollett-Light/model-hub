if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const express = require('express') // express

const bcrypt = require('bcrypt') // hashing
const passport = require('passport') // middleware convenience
const flash = require('express-flash') //
const session = require('express-session') // 
const methodOverride = require('method-override')
const upload = require("express-fileupload");
const mongo = require("mongodb");

const ObjectId = mongo.ObjectId;

const mongoClient = mongo.MongoClient
const app = express() // initiates express

const db_username = process.argv[2]
const db_password = process.argv[3]
console.log(db_username,db_password)

// Connects to database
mongoClient.connect(
  `mongodb+srv://${db_username}:${db_password}@cluster0.wwsrh.mongodb.net/local?retryWrites=true&w=majority`,
  (err, client) => {
    if (err) throw err;
    
    const db = client.db('model-hub');
    app.locals.database = db;

    console.log("Connected to database.");

    const initializePassport = require('./passport-config')
    initializePassport(
      passport,
      app.locals.database.collection("users")
    )
});

// const SALT = "=F#!AA9Ev$Ve3m@FUenH-uz?ccYkf,";
const SALT = 10;
module.exports = {
  SALT: SALT
}

const users = []

app.set('view-engine', 'ejs')
app.use(express.urlencoded({ extended: false }))
app.use(flash()) // Error messages
app.use(session({
  secret: process.env.SESSION_SALT,
  resave: false,
  saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))

app.use(upload())

// Static model testing
app.use( express.static( "static" ) );

app.get('/', checkAuthenticated, (req, res) => {
  console.log("/")
  //console.log(req.user.models.length)

  app.locals.database.collection("models").find({"_id":{"$in":req.user.models}}, (err,result) => {
    if (err) throw err
    result.toArray((err,result) => {
      res.render('index.ejs', { email: req.user.email, data: req.user.data, models: result, offers: req.user.offers })
    });
      
  })
})

// User roots
//------------------------------------
app.get('/login', checkNotAuthenticated, (req, res) => {
  console.log("/login")
  res.render('login.ejs')
})

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}))

app.get('/register', checkNotAuthenticated, (req, res) => {
  console.log("/register")
  res.render('register.ejs')
})

app.post('/register', checkNotAuthenticated, (req, res) => {
  console.log("/register")
  //console.log(req.body)

  bcrypt.hash(req.body.password,SALT,(err,hash) => {
    if (err) throw err
    app.locals.database.collection("users")
    .insertOne({email:req.body.email,hash:hash,data:req.body.data,models:[],offers:[]}, (err, result) => {
      if (err) res.redirect('/register')
      res.redirect('/login')
    })
  })
})

app.delete('/logout', (req, res) => {
  console.log("/logout")
  req.logOut()
  res.redirect('/login')
})

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next()
  }
  res.status(401)
  //res.redirect('/login')
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/')
  }
  next() // TODO Should this be a `return`?
}

// Model roots
//------------------------------------

app.get('/models/create', checkAuthenticated, (req, res) => {
  console.log("/models/create")
  res.render('create-model.ejs')
})

app.post('/models/create', checkAuthenticated, (req, res) => {
  console.log("/models/create")
  // console.log(req.body)
  // console.log(req.files)
  app.locals.database.collection("models").insertOne({title:req.body.title,desc:req.body.desc,file:req.files.file,owners:1}, (err,insertResult) => {
    if (err) throw err
    app.locals.database.collection("users").updateOne({_id:req.user._id},{$push: {models: insertResult.insertedId}}, (err,_) => {
      if (err) throw err
      res.redirect('/models/'+insertResult.insertedId)
    })
  })
})

app.get('/models/:id', checkAuthenticated, (req, res) => {
  console.log("/models/:id")

  if(req.user.models.some(val => val.equals(req.params.id))) {
    app.locals.database.collection("models").findOne({_id:ObjectId(req.params.id)}, (err,result) => {
      //console.log(result)
      if (err) throw err
      res.render("model.ejs",{ model: result })
    })
  } else {
    res.status(403)
  }
})

// TODO Prevents redundant offers (being offered viewership of model they can already view etc.)
app.put('/models/:id/shareOwnership', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/shareOwnership");
  const model_id = ObjectId(req.params.id);
  //const user_id = ObjectId(req.body.id)

  // Checks offering user has ownership of model
  let owner = await app.locals.database.collection("users").findOne({_id: req.user._id, models: model_id}).catch((err)=>{throw err})
  console.log("1\n",owner)
  if (owner != null) {
    let updateResult = await app.locals.database.collection("users").findOneAndUpdate({email:req.body.email},{$addToSet:{offers: { model: model_id, type: "own", from: req.user._id }}});
    console.log("2\n",updateResult)
    // Checks offered user exists
    if (updateResult.value != null) {
      console.log("3")
      await app.locals.database.collection("models").updateOne({_id:model_id},{$addToSet:{awaiting: { type: "own", for: updateResult.value._id }}});
    }
  }
  console.log("4")
  res.redirect("/models/"+req.params.id)
})

app.put('/models/:id/own', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/own");
  const model_id = ObjectId(req.params.id);

  // Checks model exists and has ownership offer for user
  let result = 
    await app.locals.database.collection("models").findOne({_id:model_id},{awaiting: { $elemMatch: { type: "own", for: req.user._id}}})
      .catch((err) => {throw err});
  if (result==null) res.status(403);

  await Promise.all([
    app.locals.database.collection("models").updateOne(
      {_id: model_id},
      {
        $inc: { owners: 1},
        $pull: { awaiting: { type: "own", for: req.user._id} }
      }
    ),
    app.locals.database.collection("users").updateOne(
      {_id: req.user._id},
      {
        $push: { models: model_id },
        $pull: { offers: { model: model_id }}
      }
    ),
  ]).catch((err)=> { throw err });
  
  res.redirect("/")
})

// TODO Delete all hanging offer if model gets deleted
app.delete('/models/:id/disown', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/own");
  const model_id = ObjectId(req.params.id);

  // Removes user ownership
  let user = await app.locals.database.collection("users").updateOne({_id:req.user._id}, {$pull:{models:model_id}}).catch((err)=>{throw err});

  // Checks update was made in removing user ownership (in affect checks user did own model)
  if (user.modifiedCount == 1) {
    // Decrease owner count
    let model = await app.locals.database.collection("models").findOneAndUpdate({_id: model_id}, { $inc: {owners: -1}}).catch((err)=>{throw err});
    // If 0 owners, delete
    if (model.value == 0){
      await app.locals.database.collection("models").deleteOne(({_id: model_id})).catch((err)=>{throw err});
    }
  }
  res.redirect("/")
})

//------------------------------------

app.listen(3000)

