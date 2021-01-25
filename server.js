if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const express = require('express') // express

const bcrypt = require('bcrypt') // hashing
const passport = require('passport') // middleware convenience
const flash = require('express-flash') // Error messages
const session = require('express-session') // Auth
const methodOverride = require('method-override') // Auth
const upload = require("express-fileupload"); // File upload
const mongo = require("mongodb"); // Database

const ObjectId = mongo.ObjectId;

const mongoClient = mongo.MongoClient
const app = express() // initiates express

const db_username = process.argv[2]
const db_password = process.argv[3]
console.log(db_username,db_password)

const SALT = 10;
module.exports = {
  SALT: SALT
}

const seed = require("./seed");

// Connects to database
mongoClient.connect(
  `mongodb+srv://${db_username}:${db_password}@cluster0.wwsrh.mongodb.net/local?retryWrites=true&w=majority`,
  { useUnifiedTopology: true },
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

    // Seeds database
    seed(db);

    app.listen(3000);
});

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

app.listen(3001)

app.get('/', async (req, res) => {
  console.log("/")
  //console.log(req.user.models.length)

  let models = await app.locals.database.collection("models").find(
    {public: true},
    { 
      _id: true,
      title: true,
      desc: true,
      poster: true
    }
  ).toArray();

  const strippedModels = models.map(model => { return {
    _id: model._id,
    title: model.title,
    desc: model.desc,
    poster: model.poster
  }});

  const email = req.isAuthenticated() ? req.user.email : null;

  res.render(
    'index.ejs', 
    { email: email, models: strippedModels }
  );
})


// User roots
//------------------------------------

app.get('/user', checkAuthenticated, async (req, res) => {
  console.log("/user")
  //console.log(req.user.models.length)

  // TODO Use `promise.all` here
  const models = await app.locals.database.collection("models").find(
    { _id: { $in: req.user.models } }, 
    { 
      _id: true,
      title: true,
      desc: true,
      poster: true
    }
  ).toArray();
  
  const strippedModels = models.map(model => { return {
    _id: model._id,
    title: model.title,
    desc: model.desc,
    poster: model.poster
  }});

  const views = await app.locals.database.collection("models").find(
    { _id: { $in: req.user.views } }, 
    { 
      _id: true,
      title: true,
      desc: true,
      poster: true
    }
  ).toArray();
  
  const strippedViews = views.map(view => { return {
    _id: view._id,
    title: view.title,
    desc: view.desc,
    poster: view.poster
  }});

  res.render('user.ejs', { 
    email: req.user.email,
    data: req.user.data,
    models: strippedModels,
    views: strippedViews,
    offers: req.user.offers,
    memory: req.user.memory
  });
})

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/user',
  failureRedirect: '/',
  failureFlash: true
}))

// TODO if user already register, attempt login
app.post('/register', checkNotAuthenticated, async (req, res) => {
  console.log("/register")
  //console.log(req.body)

  const hash = await bcrypt.hash(req.body.password,SALT).catch((err)=>{throw err});

  await app.locals.database.collection("users").insertOne({
    email: req.body.email,
    hash: hash,
    models: [],
    offers: [],
    memory: 0
  }).catch((err)=>{
     // Presumes error is result of email not being unique, thus checks logging in
     // TODO This trigger a scary error and uses code duplication, fix that
    passport.authenticate('local', {
      successRedirect: '/user',
      failureRedirect: '/',
      failureFlash: true
    });
  })
  res.redirect(307,'/login')
})

app.get('/logout', (req, res) => {
  console.log("/logout")
  req.logOut()
  res.redirect('/')
})

app.delete('/logout', (req, res) => {
  console.log("/logout")
  req.logOut()
  res.redirect('/')
})

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next()
  }
  //res.status(401)
  res.redirect('/login')
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/user')
  }
  next() // TODO Should this be a `return`?
}

// Model roots
//------------------------------------

app.get('/models/create', checkAuthenticated, (req, res) => {
  console.log("/models/create")
  res.render('create-model.ejs')
})

// TODO Should this be "/models"
app.post('/models/create', checkAuthenticated, async (req, res) => {
  console.log("/models/create");
  // console.log(typeof req.body.public, req.body.public);

  const size = req.files.poster.size + req.files.model.size;
  if (req.files.poster.size < 30*1024) {
    // console.log(req.files)
    const public = req.body.public=="on" ? true : false;
    let model = {
      title: req.body.title,
      desc: req.body.desc,
      poster: req.files.poster,
      versions: [{file: req.files.model, date: new Date(), desc: "Initial" }],
      owners: 1,
      public: public,
      awaiting: []
    };

    if(!public) {
      model.viewers = []
    }

    const insert = await app.locals.database.collection("models").insertOne(model);

    await app.locals.database.collection("users").updateOne(
      { _id: req.user._id },
      { 
        $push: {models: insert.insertedId },
        $inc: { memory: size }
      }
    ).catch((err)=>{
      // Presumes error is result of memory being more than max
      res.redirect('/models/create')
    });

    res.redirect('/models/' + insert.insertedId)
  } else {
    res.redirect('/models/create')
  }
  
})

// TODO Make this nicer
app.get('/models/:id', async (req, res) => {
  console.log("/models/:id")
  
  const model = await app.locals.database.collection("models").findOne({ _id: ObjectId(req.params.id) });
  if (model==null) res.status(403)
  else if (req.isAuthenticated()) {
    const owns = req.user.models.some(val => val.equals(req.params.id));
    const views = req.user.views.some(val => val.equals(req.params.id));
    // console.log(owns,views);

    if (model.public) {
      res.render("model.ejs",{ email: req.user.email, owner: owns, model: model })
    }
    else if(owns || views) {
      res.render("model.ejs",{ email: req.user.email, owner: owns, model: model })
    }
  }
  else if(model.public) {
    res.render("model.ejs",{ email: null, owner: false, model: model })
  }
  else {
    res.status(403)
  }
})

app.put('/models/:id', checkAuthenticated, async (req, res) => {
  console.log("/models/:id")
  // console.log(req.body);
  // console.log(req.files);

  if (req.user.models.some(val => val.equals(req.params.id))) {
    let update = {};
    if (req.body.title!='') update.title = req.body.title;
    if (req.body.desc!='') update.desc = req.body.desc;
    if (req.files!=null) update.poster = req.files.poster;
    console.log(update)
    await app.locals.database.collection("models").updateOne({ _id: ObjectId(req.params.id) },{ $set: update });
  }
  
  res.redirect("/models/" + req.params.id);
})

app.post('/models/:id/version', checkAuthenticated, async (req, res) => {
  console.log("/models/:id")
  const model_id = ObjectId(req.params.id);

  // Checks user has ownership of model
  const owner = await app.locals.database.collection("users").findOne({
    _id: req.user._id,
    models: model_id
  }).catch((err)=>{throw err})

  if (owner != null) {
    await app.locals.database.collection("users").updateOne(
      { _id: req.user._id },
      { $inc: { memory: req.files.file.size } }
    ).catch((err) => {
      res.redirect("/models/" + req.params.id);
    });
    await app.locals.database.collection("models").updateOne(
      { _id: model_id},
      { $push: { versions: { file: req.files.file, date: new Date(), desc: req.body.desc }}}
    );
    res.redirect("/models/" + req.params.id);
  }
  res.status(403);
})


// TODO Prevents redundant offers (being offered viewership of model they can already view etc.)
app.put('/models/:id/shareOwnership', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/shareOwnership");
  const model_id = ObjectId(req.params.id);
  //const user_id = ObjectId(req.body.id)

  // Checks offering user has ownership of model
  const owner = await app.locals.database.collection("users").findOne({
    _id: req.user._id,
    models: model_id
  }).catch((err)=>{throw err})

  //console.log("1\n",owner)
  if (owner != null) {
    const updateResult = await app.locals.database.collection("users").findOneAndUpdate(
      { email: req.body.email},
      { $addToSet: { offers: { model: model_id, type: "own", from: req.user._id }}}
    );

    //console.log("2\n",updateResult)
    // Checks offered user exists
    if (updateResult.value != null) {
      //console.log("3")
      await app.locals.database.collection("models").updateOne(
        { _id: model_id},
        { $addToSet: { awaiting: { type: "own", for: updateResult.value._id }}}
      );
    }
  }
  console.log("4")
  res.redirect("/models/" + req.params.id)
})

app.put('/models/:id/share', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/share");
  const model_id = ObjectId(req.params.id);
  //const user_id = ObjectId(req.body.id)

  // Checks offering user has ownership of model
  const owner = await app.locals.database.collection("users").findOne({
    _id: req.user._id,
    models: model_id
  });

  if (owner==null) res.sendStatus(403);
  // If user exists
  const user = await app.locals.database.collection("users").findOne({ email: req.body.email });
  if (user != null) {
    // If user doesn't already view the model
    const contains = user.views.some(val => val.equals(req.params.id))
    if(!contains) {
      await Promise.all([
        app.locals.database.collection("models").updateOne(
          { _id: model_id},
          { $addToSet: { awaiting: { type: "view", for: user._id }}}
        ),
        app.locals.database.collection("users").updateOne(
          { _id: user._id },
          { $addToSet: { offers: { model: model_id, type: "view", from: req.user._id } } }
        )
      ]);
    }
  }
  res.redirect("/models/" + req.params.id)
})

app.put('/models/:id/own', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/own");
  const model_id = ObjectId(req.params.id);

  // Checks model exists and has ownership offer for user
  const model = await app.locals.database.collection("models").findOne({
    _id: model_id,
    awaiting: { $elemMatch: { type: "own", for: req.user._id}}
  }).catch((err) => {throw err});

  if (model==null) res.status(403);

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
  
  res.redirect("/user")
})

app.put('/models/:id/view', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/view");
  const model_id = ObjectId(req.params.id);

  // Checks model exists and has offer to be pulled
  const update = await app.locals.database.collection("models").updateOne(
    { _id: model_id },
    { $pull: { awaiting: { type: "view", for: req.user._id} } }
  );
  
  if (update.modifiedCount == 0) res.sendStatus(403);
  // If found and modified `update.modifiedCount!=0` then model exists and did have offer

  // The `$push`s here do not need to be `$addToSet` as a user cannot have an offer to view 
  //  something they already view.
  await Promise.all([
    // TODO Combine this with earlier "models" update
    app.locals.database.collection("models").updateOne(
      { _id: model_id },
      { $push: { viewers: req.user._id } }
    ),
    app.locals.database.collection("users").updateOne(
      { _id: req.user._id },
      {
        $push: { views: model_id },
        $pull: { offers: { model: model_id }}
      }
    )
  ])
  
  res.redirect("/user")
})

// TODO Delete all hanging offer if model gets deleted
app.delete('/models/:id/disown', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/own");
  const model_id = ObjectId(req.params.id);

  // Removes user ownership
  const user = await app.locals.database.collection("users").updateOne(
    { _id: req.user._id },
    { $pull: { models: model_id } }
  );

  // Checks update was made in removing user ownership (in affect checks user did own model)
  if (user.modifiedCount == 1) {
    // Decrease owner count
    const model = await app.locals.database.collection("models").findOneAndUpdate(
      {_id: model_id},
      { $inc: {owners: -1}}
    );

    // If owners equalled 1 before the change, it equals 0 now, therefore delete
    if (model.value.owners == 1) {
      await Promise.all([
        // Delete model
        app.locals.database.collection("models").deleteOne(({_id: model_id})),
        // Deletes offers
        app.locals.database.collection("users").updateMany(
          { _id: { $in: model.value.awaiting.map(x=>x.for) } },
          { $pull: { offers: { model: model_id } } }
        )
      ]);
      if (!model.value.public) {
        // Delete views
        await app.locals.database.collection("users").updateMany(
          { _id: { $in: model.value.viewers } },
          { $pull: { views: model_id } }
        );
      }
    }
  }
  res.redirect("/user")
})

//------------------------------------

