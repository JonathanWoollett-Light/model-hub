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

app.get('/', async (req, res) => {
  console.log("/");

  // Get tags from top 100 models
  const tags = await app.locals.database.collection("models").find(
    { public: true },
  ).project({
    _id: false,
    tags: true
  }).limit(100).sort({ stars: -1 }).toArray();
  // console.log(tags)
  const distinctTags = [...new Set(tags.flatMap(x=>x.tags))];
  // console.log(distinctTags)

  res.redirect("/landing/"+distinctTags.join(","));
})

app.get("/landing/:tags", async(req,res) => {
  console.log("/landing/:tags");

  const tags = req.params.tags.split(",");

  // Gets top 20 models from given tags
  const models = await app.locals.database.collection("models").find({
    public: true,
    tags: { $elemMatch: { $in: tags } } // Where any tag in the model matches any tag in the given tags
  }).project({
    title: true,
    "poster.data": true,
    tags: true
  }).limit(20).sort({ stars: -1 }).toArray();

  // Get all tags from top 100 models
  const topTags = await app.locals.database.collection("models").find(
    { public: true },
  ).project({
    _id: false,
    tags: true
  }).limit(100).sort({ stars: -1 }).toArray();
  const distinctTags = [...new Set(topTags.flatMap(x=>x.tags))];

  const email = req.isAuthenticated() ? req.user.email : null;
  const masonry = req.isAuthenticated() ? req.user.masonry : true;

  res.render(
    'index.ejs', 
    { email: email, models: models, masonry: masonry, tags: tags, topTags: distinctTags }
  );
})

app.get('/about', async (req, res) => {
  console.log("/about")
  
  res.render('about.ejs',{email: req.isAuthenticated() ? req.user.email : null});
})

// User roots
//------------------------------------

app.get('/user', checkAuthenticated, async (req, res) => {
  console.log("/user")

  Promise.all([
    // Models user owns
    app.locals.database.collection("models").find(
      { _id: { $in: req.user.models } }
    ).project({
      title: true,
      "poster.data": true
    }).toArray(),
    // Models user views
    app.locals.database.collection("models").find(
      { _id: { $in: req.user.views } }
    ).project({
      title: true,
      "poster.data": true
    }).toArray(),
    // Models user stars
    app.locals.database.collection("models").find(
      { _id: { $in: req.user.stars } }
    ).project({
      title: true,
      "poster.data": true
    }).toArray(),
    // Models user has been offered
    app.locals.database.collection("models").find(
      { _id: { $in: req.user.offers.map(x=>x.model) } }
    ).project({
      title: true,
      "poster.data": true,
      size: true
    }).toArray(),
    // Groups user has been invited to
    app.locals.database.collection("groups").find(
      { _id: { $in: req.user.invites.map(x=>x.group) } }
    ).project({
      name: true,
      models: true
    }).toArray(),
    // Groups user owns
    app.locals.database.collection("groups").find(
      { _id: { $in: req.user.ownGroups } }
    ).project({
      name: true
    }).toArray(),
    // Groups user views
    app.locals.database.collection("groups").find(
      { _id: { $in: req.user.viewGroups } }
    ).project({
      name: true
    }).toArray()
  ]).then(async (data)=> {
    // Get total sizes of all group ownership offers
    const groupSizes = await Promise.all(data[4].map(async (e,i) => {
      if (req.user.invites[i].type == "view") return 0;

      const models = await app.locals.database.collection("models").find(
        { _id: { $in: e.models } },
      ).project({
        size: true
      }).toArray();
      const groupSize = models.map(x=>x.size).reduce((a,b)=>a+b,0);
      return groupSize;
    }));
    

    res.render('user.ejs', { 
      email: req.user.email,
      data: req.user.data,
      models: data[0],
      views: data[1],
      stars: data[2],
      offers: req.user.offers,
      offerModels: data[3],
      invites: req.user.invites,
      inviteGroups: data[4],
      groupSizes: groupSizes,
      memory: req.user.memory,
      masonry: req.user.masonry,
      ownGroups: data[5],
      viewGroups: data[6]
    });
  });
})

app.put('/user/masonry-on', checkAuthenticated, async (req, res) => {
  console.log("/user/masonry-on");
  await app.locals.database.collection("users").updateOne({ _id: req.user._id }, { $set: { masonry: true } });
  res.status(200);
  // TODO Use `promise.all` here
})
app.put('/user/masonry-off', checkAuthenticated, async (req, res) => {
  console.log("/user/masonry-off");
  await app.locals.database.collection("users").updateOne({ _id: req.user._id }, { $set: { masonry: false } });
  res.status(200);
  // TODO Use `promise.all` here
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
    views: [],
    offers: [],
    invites: [],
    memory: 0,
    stars: [],
    ownGroups: [],
    viewGroups: []
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
  res.redirect('/')
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/user')
  }
  next() // TODO Should this be a `return`?
}

// Group roots
//------------------------------------

app.get('/groups/create', checkAuthenticated, async (req, res) => {
  console.log("/groups/create");

  res.render('create-group.ejs', { email: req.user.email });
})

app.post('/groups/create', checkAuthenticated, async (req, res) => {
  console.log("/groups/create");

  const id = new ObjectId();
  let group = {
    _id: id,
    name: req.body.name,
    desc: req.body.desc,
    owners: [req.user._id],
    viewers: [],
    models: []
  };

  await Promise.all([
    app.locals.database.collection("groups").insertOne(group),
    app.locals.database.collection("users").updateOne(
      { _id: req.user._id },
      { $push: { ownGroups: id } }  
    )
  ]);

  res.redirect("/groups/"+id);
})

app.get('/groups/:id', checkAuthenticated, async (req, res) => {
  console.log("/groups/:id")
  
  const group = await app.locals.database.collection("groups").findOne({ _id: ObjectId(req.params.id) });
  if (group==null) res.status(403);
  else {
    const owns = group.owners.some(val => val.equals(req.user._id));
    const views = group.viewers.some(val => val.equals(req.user._id));
    if(owns || views){
      const models = await app.locals.database.collection("models").find(
        { _id: { $in: group.models } }
      ).project({
        title: true,
        "poster.data": true
      }).toArray();

      group.models = models;
      
      res.render("group.ejs", { email: req.user.email, owns: owns, group: group, masonry: req.user.masonry })
    }
  }
})

app.put("/groups/:id/shareOwnership", checkAuthenticated, async (req, res) => {
  console.log("/groups/:id/shareOwnership");
  const groupId = ObjectId(req.params.id);

  // Checks inviting user exists and has ownership of group
  const owner = await app.locals.database.collection("users").findOne({
    _id: req.user._id,
    ownGroups: groupId
  });

  if (owner != null) {
    // Check invited user exists
    const user = await app.locals.database.collection("users").findOne({ email: req.body.email });
    if(user != null) {
      // Check invited user doesn't already own group
      const owns = user.ownGroups.some(val => val.equals(req.params.id));
      if (!owns) {
        // `$addToSet` here prevents duplicating invites
        await Promise.all([
          // Add awaiting to group
          app.locals.database.collection("groups").updateOne(
            { _id: groupId },
            { $addToSet: { awaiting: { type: "own", for: user._id }}}
          ),
          // Add invite to user
          app.locals.database.collection("users").updateOne(
            { _id: user._id },
            { $addToSet: { invites: { group: groupId, type: "own", from: req.user._id } } }
          )
        ]);
      }
    }
  }
  res.redirect("/groups/" + req.params.id)
})
app.put("/groups/:id/share", checkAuthenticated, async (req, res) => {
  console.log("/groups/:id/share");
  const groupId = ObjectId(req.params.id);

  // Checks inviting user exists and has ownership of group
  const owner = await app.locals.database.collection("users").findOne({
    _id: req.user._id,
    ownGroups: groupId
  });

  if (owner != null) {
    // Check invited user exists
    const user = await app.locals.database.collection("users").findOne({ email: req.body.email });
    if(user != null) {
      // Check invited user doesn't already view group
      const views = user.viewGroups.some(val => val.equals(req.params.id))
      if (!views) {
        await Promise.all([
          app.locals.database.collection("groups").updateOne(
            { _id: groupId },
            { $addToSet: { awaiting: { type: "view", for: user._id }}}
          ),
          app.locals.database.collection("users").updateOne(
            { _id: user._id },
            { $addToSet: { invites: { group: groupId, type: "view", from: req.user._id } } }
          )
        ]);
      }
    }
  }
  res.redirect("/groups/" + req.params.id)
})

// Needs to be `get` so can be called from `<a>`
app.get("/groups/:id/own/accept", checkAuthenticated, async (req, res) => {
  console.log("/groups/:id/own/accept");
  const groupId = ObjectId(req.params.id);

  // Checks group exists and has ownership invite for user
  const group = await app.locals.database.collection("groups").find({
    _id: groupId,
    awaiting: { $elemMatch: { type: "own", for: req.user._id}}
  }).limit(1).project({
    models: true
  }).toArray();

  if (group.length != 0) {
    const models = await app.locals.database.collection("models").find(
      { _id: { $in: group[0].models } },
    ).project({
      size: true
    }).toArray();
    const groupSize = models.map(x=>x.size).reduce((a,b)=>a+b,0);

    // We can use `$push` over `$addToSet` as when an invite is sent it checks they do 
    //  not already have it.
    //
    // For Adding models in the group to the user, a user may already own some models,
    //  thus we need `$addToSet`.
    await Promise.all([
      // Remove awaiting from group, push user as owner
      app.locals.database.collection("groups").updateOne(
        { _id: groupId },
        {
          $push: { owners: req.user._id },
          $pull: { awaiting: { type: "own", for: req.user._id} }
        }
      ),
      // Remove invite from user, push all models in group to user, increment user memory by total model size
      app.locals.database.collection("users").updateOne(
        { _id: req.user._id },
        {
          $addToSet: { models: { $each: group[0].models } },
          $pull: { invites: { group: groupId } },
          $inc: { memory: groupSize }
        }
      ),
      // For all models in group, increment owners by 1
      app.locals.database.collection("models").updateMany(
        { _id: { $in: group[0].models } },
        { $inc: { owners: 1 } }
      )
    ]);
  }

  res.redirect("/user");
})
// Needs to be `get` so can be called from `<a>`
app.get("/groups/:id/own/decline", checkAuthenticated, async (req, res) => {
  console.log("/groups/:id/own/decline");
  const groupId = ObjectId(req.params.id);

  // Checks group exists and has ownership invite for user
  const group = await app.locals.database.collection("groups").countDocuments(
    {
      _id: groupId,
      awaiting: { $elemMatch: { type: "own", for: req.user._id}}
    },
    limit = 1
  );

  if (group != 0) {
    await Promise.all([
      // Removes awaiting from group
      app.locals.database.collection("groups").updateOne(
        { _id: groupId },
        { $pull: { awaiting: { type: "own", for: req.user._id} } }
      ),
      // Removes invite from user
      app.locals.database.collection("users").updateOne(
        { _id: req.user._id },
        { $pull: { invites: { group: groupId } } }
      )
    ]);
  }

  res.redirect("/user");
})
// Needs to be `get` so can be called from `<a>`
app.get("/groups/:id/view/accept", checkAuthenticated, async (req, res) => {
  console.log("/groups/:id/view/accept");
  const groupId = ObjectId(req.params.id);

  // Checks group exists and has viewership invite for user
  const group = await app.locals.database.collection("groups").find({
    _id: groupId,
    awaiting: { $elemMatch: { type: "view", for: req.user._id}}
  }).limit(1).project({
    models: true
  }).toArray();

  if (group.length != 0) {
    // We can use `$push` over `$addToSet` as when an invite is sent it checks they do 
    //  not already have it.
    //
    // For Adding models in the group to the user, a user may already view some models,
    //  thus we need `$addToSet`.
    await Promise.all([
      // Remove awaiting from group, push user as viewer
      app.locals.database.collection("groups").updateOne(
        { _id: groupId },
        {
          $push: { owners: req.user._id },
          $pull: { awaiting: { type: "view", for: req.user._id} }
        }
      ),
      // Remove invite from user, push all models in group to user
      app.locals.database.collection("users").updateOne(
        { _id: req.user._id },
        {
          $addToSet: { views: { $each: group[0].models } },
          $pull: { invites: { group: groupId }}
        }
      )
    ]);
  }

  res.redirect("/user");
})
// Needs to be `get` so can be called from `<a>`
app.get("/groups/:id/view/decline", checkAuthenticated, async (req, res) => {
  console.log("/groups/:id/own/decline");
  const groupId = ObjectId(req.params.id);

  // Checks group exists which has viewership invite for user
  const group = await app.locals.database.collection("groups").countDocuments(
    {
      _id: groupId,
      awaiting: { $elemMatch: { type: "view", for: req.user._id}}
    },
    limit = 1
  );

  if (group != 0) {
    await Promise.all([
      // Removes awaiting from group
      app.locals.database.collection("groups").updateOne(
        { _id: groupId },
        { $pull: { awaiting: { type: "view", for: req.user._id} } }
      ),
      // Removes invite from user
      app.locals.database.collection("users").updateOne(
        { _id: req.user._id },
        { $pull: { invites: { group: groupId } } }
      )
    ]);
  }

  res.redirect("/user");
})

// Model roots
//------------------------------------

app.get('/models/search/:info', async (req, res) => {
  console.log("/models/search/:info")
  //console.log(req.params.tags);

  const indx = req.params.info.indexOf(":");
  const title = req.params.info.substr(0,indx);
  const tags = req.params.info.substr(indx+1).split(",");
  if(tags[0] == "") tags = []; // TODO Is there a better way to deal with this?

  const models = await app.locals.database.collection("models").find({
    public: true,
    title: { $regex: ".*"+title+".*" },
    tags: { $elemMatch: { $in: tags } } // Where any tag in the model matches any tag in the given tags
  }).project({
    title: true,
    "poster.data": true,
    tags: true
  }).limit(20).sort({ stars: -1 }).toArray();

  //console.log(models);
  res.json(models);
})

app.get('/models/create', checkAuthenticated, async (req, res) => {
  console.log("/models/create");

  Promise.all([
    app.locals.database.collection("models").find(
      { public: true },
    ).project({
      _id: false,
      tags: true
    }).limit(100).sort({ stars: -1 }).toArray(),

    app.locals.database.collection("groups").find(
      { _id: { $in: req.user.ownGroups } }
    ).project({
      name: true
    }).toArray()
    
  ]).then((data)=>{
    let distinctTags = [...new Set(data[0].flatMap(x=>x.tags))];

    res.render('create-model.ejs', { email: req.user.email, tags: distinctTags, groups: data[1] })
  });
})

// TODO Should this be "/models"
// TODO remove magic numbers
// TODO user feedback on fail? rn it just redirects back
app.post('/models/create', checkAuthenticated, async (req, res) => {
  console.log("post to /models/create");

  const size = req.files.poster.size + req.files.model.size;
  if (req.files.poster.size < 30*1024) { 
    // console.log(req.files)
    const public = req.body.public=="on";
    
    // Get tags
    let tags = req.body.tags.split(",");
    if(tags[0] == "") tags = [];

    // Construct specification map
    let spec = {}
    for(let i=0;req.body["key"+i]!=null;i++){
      if(req.body["key"+i]=="") continue;
      spec[req.body["key"+i]] = req.body["value"+i];
    }

    // Create model object
    const modelId = new ObjectId();
    let model = {
      _id: modelId,
      title: req.body.title,
      desc: req.body.desc,
      poster: req.files.poster,
      versions: [{file: req.files.model, date: new Date(), desc: "Initial" }],
      owners: 1,
      public: public,
      awaiting: [],
      tags: tags,
      spec: spec,
      size: size
    };
    
    // Add public/private respective fields
    if (public) {
      model.stars = 0;
      model.followers = [];
    } else {
      model.viewers = []
    };

    // Add model to user, increment model size. 
    // MongoDB has validation requiring `memory` be less than some value, 
    // thus if it increments to being over this operation will throw an error.

    var flag = false; // the flag is to be set to true if error happens 
    //and we need to stop executing the rest of the code
    await app.locals.database.collection("users").updateOne(
      { _id: req.user._id },
      {
        $push: { models: modelId },
        $inc: { memory: size }
      }
    ).catch((err)=>{
      // Presume error is result of memory being more than max
      res.redirect('/models/create'); // TODO Does this actually end this function?
      // no, this doesn't end anything. 
      // we are inside lambda function which is in another lambda function anyways
      // so we cant just return either
      flag = true;
    });
    if (flag){
      console.log("user over the limit when creating file");
      return;
    }
    // Set group Ids
    const groupArray = Array.isArray(req.body.groups) ? req.body.groups : [req.body.groups];
    const groupIds = groupArray.map(x => new ObjectId(x));

    await Promise.all([
      // Insert model
      // TODO there seems to be a limit of ~18mb files that the database can upload
      app.locals.database.collection("models").insertOne(model),
      // Add model to all given groups
      app.locals.database.collection("groups").updateMany(
        { _id: { $in: groupIds } },
        { $push: { models: modelId } }
      ),
      // Excluding this user: Add model ownership to all owners of given groups, increment all owners of given groups by model size
      app.locals.database.collection("users").updateMany(
        { 
          ownGroups: { $in: groupIds }, 
          _id: { $ne: req.user_id } 
        },
        { 
          $addToSet: { models: modelId },
          $inc: { memory: size }
        },
      ),
      // Add model viewership to all viewer of given groups
      app.locals.database.collection("users").updateMany(
        { viewGroups: { $in: groupIds } },
        { $addToSet: { views: modelId } }
      )
    ]);

    res.redirect('/models/' + modelId);
  } else {
    res.redirect('/models/create');
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
    const starred = req.user.stars.some(val => val.equals(req.params.id));

    // Tags used in top 100 models for autocomplete
    const tags = await app.locals.database.collection("models").find(
      { public: true },
    ).project({
      _id: false,
      tags: true
    }).limit(100).sort({ stars: -1 }).toArray();
    //console.log(tags)
    let distinctTags = [...new Set(tags.flatMap(x=>x.tags))];

    if (model.public || owns || views) {
      res.render("model.ejs", { email: req.user.email, owner: owns, model: model, starred: starred, tags: distinctTags })
    } else {
      res.status(403);
    }
  }
  else if(model.public) {
    res.render("model.ejs",{ email: null, owner: false, model: model, starred: false, tags: [] })
  } else { 
    res.status(403);
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
app.put('/models/:id/tags/:tags', checkAuthenticated, async (req, res) => {
  console.log("/models/tags/:tags")

  // Checks user owns model
  const owns = req.user.models.some(val => val.equals(req.params.id));
  if (owns) {
    const tags = req.params.tags.split(",");
    if(tags[0] == "") tags = [];
    if(tags.length > 5) {
      res.status(400)
    } else {
      await app.locals.database.collection("models").updateOne(
        { _id: ObjectId(req.params.id) },
        { $set: { tags: tags } }
      );
      res.status(200);
    }
  } else {
    res.status(403);
  }
})
app.put('/models/:id/spec/value/:pair', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/spec/value/:pair")
  // Checks user owns model
  const owns = req.user.models.some(val => val.equals(req.params.id));
  if (owns) {
    const indx = req.params.pair.indexOf(",");
    const key = req.params.pair.substr(0,indx);
    const value = req.params.pair.substr(indx+1);

    let set = {};
    set["spec."+key] = value;
    // console.log(set);

    await app.locals.database.collection("models").updateOne(
      { _id: ObjectId(req.params.id) },
      { $set: set }
    );
    res.status(200);
  } else {
    res.status(403);
  }
})
app.put('/models/:id/spec/key/:pair', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/spec/key/:pair")
  // Checks user owns model
  const owns = req.user.models.some(val => val.equals(req.params.id));
  if (owns) {
    const indx = req.params.pair.indexOf(",");
    const oldKey = req.params.pair.substr(0,indx);
    const newKey = req.params.pair.substr(indx+1);

    let rename = {};
    rename["spec."+oldKey] = "spec."+newKey;
    // console.log(rename);

    await app.locals.database.collection("models").updateOne(
      { _id: ObjectId(req.params.id) },
      { $rename: rename }
    );
    res.status(200);
  } else {
    res.status(403);
  }
})


// like
app.put('/models/:id/star', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/star");

  // Check public model exists
  const model = await app.locals.database.collection("models").findOne({ 
    _id: ObjectId(req.params.id),
    public: true
  });
  if (model==null) res.status(403);
  else {
    const update = await app.locals.database.collection("users").updateOne(
      { _id: req.user._id },
      { $addToSet: { stars: ObjectId(req.params.id) } }
    );
    // If $addToSet lead to an update, i.e. if the user hasn't already starred the model
    if (update.modifiedCount==1) {
      await app.locals.database.collection("models").updateOne(
        { _id: ObjectId(req.params.id) },
        { $inc: { stars: 1 }, $push: { followers: req.user._id } }
      );
    }
    res.status(200);
  }
})
// un-like
app.put('/models/:id/unstar', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/unstar");

  // Check public model exists
  const model = await app.locals.database.collection("models").findOne({ 
    _id: ObjectId(req.params.id),
    public: true
  });
  if (model==null) res.status(403);
  else {
    const update = await app.locals.database.collection("users").updateOne(
      { _id: req.user._id },
      { $pull: { stars: ObjectId(req.params.id) } }
    );
    // If $pull lead to an update, i.e. if the user had starred the model
    if (update.modifiedCount==1) {
      await app.locals.database.collection("models").updateOne(
        { _id: ObjectId(req.params.id) },
        { $inc: { stars: -1 }, $pull: { followers: req.user._id } }
      );
    }
    res.status(200);
  }
})

app.post('/models/:id/version', checkAuthenticated, async (req, res) => {
  console.log("/models/:id")
  const modelId = ObjectId(req.params.id);

  // Check user owns model
  const owns = req.user.models.some(val => val.equals(req.params.id));

  if (owns) {
    await Promise.all([
      // Increment user memory by size of new version
      app.locals.database.collection("users").updateOne(
        { _id: req.user._id },
        { $inc: { memory: req.files.file.size } }
      ),
      // Add new version to model, increment size of model by size of new version
      app.locals.database.collection("models").updateOne(
        { _id: modelId},
        { $push: { versions: { file: req.files.file, date: new Date(), desc: req.body.desc } } },
        { $inc: { size: req.files.file.size } }
      )
    ]);
  }
  res.redirect("/models/" + req.params.id);
})

// this sends an offer
app.put('/models/:id/shareOwnership', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/shareOwnership");
  const modelId = ObjectId(req.params.id);

  // Checks offering user exists and has ownership of model
  const owner = await app.locals.database.collection("users").countDocuments(
    {
      _id: req.user._id,
      models: modelId
    },
    limit = 1
  );

  if (owner != 0) {
    // Check offered user exists
    const user = await app.locals.database.collection("users").findOne({ email: req.body.email });
    if (user != null) {
      // Check offered user doesn't already own model
      const owns = user.models.some(val => val.equals(req.params.id));
      if (!owns) {
        // `$addToSet` here prevents duplicating offers
        await Promise.all([
          // Add awaiting to model
          app.locals.database.collection("models").updateOne(
            { _id: modelId },
            { $addToSet: { awaiting: { type: "own", for: user._id }}}
          ),
          // Add offer to user
          app.locals.database.collection("users").updateOne(
            { _id: user._id },
            { $addToSet: { offers: { model: modelId, type: "own", from: req.user._id } } }
          )
        ]);
      }
    }
  }
  res.redirect("/models/" + req.params.id);
})

// this sets up viewing permisions
app.put('/models/:id/share', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/share");
  const modelId = ObjectId(req.params.id);

  // Checks offering user exists and has ownership of model
  const owner = await app.locals.database.collection("users").countDocuments(
    {
      _id: req.user._id,
      models: modelId
    },
    limit = 1
  );

  if (owner != 0) {
    // Check offered user exists
    const user = await app.locals.database.collection("users").findOne({ email: req.body.email });
    if (user != null) {
      // Check offered user doesn't already view model
      const owns = user.views.some(val => val.equals(req.params.id));
      if (!owns) {
        // `$addToSet` here prevents duplicating offers
        await Promise.all([
          // Add awaiting to model
          app.locals.database.collection("models").updateOne(
            { _id: modelId },
            { $addToSet: { awaiting: { type: "view", for: user._id }}}
          ),
          // Add offer to user
          app.locals.database.collection("users").updateOne(
            { _id: user._id },
            { $addToSet: { offers: { model: modelId, type: "view", from: req.user._id } } }
          )
        ]);
      }
    }
  }
  res.redirect("/models/" + req.params.id);
})

// Needs to be `get` so can be called from `<a>`
// this gives ownership for accepting offer (or seems to)
app.get('/models/:id/own/accept', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/own/accept");
  const modelId = ObjectId(req.params.id);

  // Checks model exists which has ownership offer for user
  const model = await app.locals.database.collection("models").find({
    _id: modelId,
    awaiting: { $elemMatch: { type: "own", for: req.user._id}}
  }).limit(1).project({
    size: true
  }).toArray();

  if (model.length != 0) {
    // We can use `$push` over `$addToSet` as when an offer is sent it checks they do 
    // not already have it.
    // right, here is where i needa check for memory limit
    await app.locals.database.collection("users").updateOne(
      { _id: req.user._id },
      {
        $push: { models: modelId },
        $pull: { offers: { model: modelId } },
        $inc: { memory: model[0].size }
      }
    ).catch((err)=>{
      // Presume error is result of memory being more than max
      res.redirect('/user'); // send it somewhere where it makes sense for now
      // TODO figure out user feedback
      return;
    });
    await Promise.all([
      // Remove awaiting from model, increment owners by 1
      app.locals.database.collection("models").updateOne(
        { _id: modelId },
        {
          $inc: { owners: 1},
          $pull: { awaiting: { type: "own", for: req.user._id} }
        }
      ),
      // Remove offer from user, push model, increment user memory
      ]);
  }

  res.redirect("/user");
})
// Needs to be `get` so can be called from `<a>`
app.get('/models/:id/own/decline', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/own/decline");
  const modelId = ObjectId(req.params.id);

  // Checks model exists which has ownership offer for user
  const model = await app.locals.database.collection("models").countDocuments(
    {
      _id: modelId,
      awaiting: { $elemMatch: { type: "view", for: req.user._id}}
    },
    limit = 1
  );

  if (model != 0) {
    await Promise.all([
      // Removes awaiting from model
      app.locals.database.collection("models").updateOne(
        { _id: modelId },
        { $pull: { awaiting: { type: "own", for: req.user._id } } }
      ),
      // Removes offer from user
      app.locals.database.collection("users").updateOne(
        { _id: req.user._id },
        { $pull: { offers: { model: modelId } } }
      )
    ]);
  }
  
  res.redirect("/user");
})
// Needs to be `get` so can be called from `<a>`
app.get('/models/:id/view/accept', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/view/accept");
  const modelId = ObjectId(req.params.id);

  // Checks model exists which has viewership offer for user
  const model = await app.locals.database.collection("models").countDocuments(
    {
      _id: modelId,
      awaiting: { $elemMatch: { type: "view", for: req.user._id}}
    },
    limit = 1
  );

  if (model != 0) {
    // We can use `$push` over `$addToSet` as when an offer is sent it checks they do 
    //  not already have it.
    await Promise.all([
      // Remove awaiting from model
      app.locals.database.collection("models").updateOne(
        { _id: modelId },
        { $pull: { awaiting: { type: "view", for: req.user._id} } }
      ),
      // Remove offer from user, push model
      app.locals.database.collection("users").updateOne(
        { _id: req.user._id },
        {
          $push: { views: modelId },
          $pull: { offers: { model: modelId }}
        }
      ),
    ]);
  }

  res.redirect("/user");
})
// Needs to be `get` so can be called from `<a>`
app.get('/models/:id/view/decline', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/view/decline");
  const modelId = ObjectId(req.params.id);

  // Checks model exists which has viewership offer for user
  const model = await app.locals.database.collection("models").countDocuments(
    {
      _id: modelId,
      awaiting: { $elemMatch: { type: "view", for: req.user._id}}
    },
    limit = 1
  );

  if (model != 0) {
    await Promise.all([
      // Removes awaiting from model
      app.locals.database.collection("models").updateOne(
        { _id: modelId },
        { $pull: { awaiting: { type: "view", for: req.user._id } } }
      ),
      // Removes offer from user
      app.locals.database.collection("users").updateOne(
        { _id: req.user._id },
        { $pull: { offers: { model: modelId } } }
      )
    ]);
  }
  
  res.redirect("/user");
})

// TODO Delete all hanging offer if model gets deleted
app.delete('/models/:id/disown', checkAuthenticated, async (req, res) => {
  console.log("/models/:id/disown");
  const modelId = ObjectId(req.params.id);

  // Check user owns model
  const owns = req.user.models.some(val => val.equals(req.params.id));

  if (owns) {
    // Decrease owner count
    const model = await app.locals.database.collection("models").findOneAndUpdate(
      {_id: modelId},
      { $inc: {owners: -1}}
    );

    // Removes user ownership
    await app.locals.database.collection("users").updateOne(
      { _id: req.user._id },
      { 
        $pull: { models: modelId },
        $inc: { memory: -model.value.size }
      }
    );

    // If owners equalled 1 before the change, it equals 0 now, therefore delete
    if (model.value.owners == 1) {
      await Promise.all([
        // Delete model
        app.locals.database.collection("models").deleteOne(
          { _id: modelId }
        ),
        // Deletes offers
        app.locals.database.collection("users").updateMany(
          { _id: { $in: model.value.awaiting.map(x=>x.for) } },
          { $pull: { offers: { model: modelId } } }
        ),
        // Remove model from all groups
        app.locals.database.collection("groups").updateMany(
          { models: modelId },
          { $pull: { models: modelId } }
        )
      ]);
      if(model.value.public) {
        // Deletes stars
        await app.locals.database.collection("users").update(
          { _id: { $in: model.value.followers } },
          { $pull: { stars: modelId } }
        )
      }
      else {
        // Delete views
        await app.locals.database.collection("users").updateMany(
          { _id: { $in: model.value.viewers } },
          { $pull: { views: modelId } }
        );
      }
    }
  }
  res.redirect("/user")
})