const LocalStrategy = require('passport-local').Strategy
const bcrypt = require('bcrypt')
const SALT = require('./server').SALT;
const ObjectId = require('mongodb').ObjectID;

function initialize(passport, collection) {
  const authenticateUser = (email, password, done) => {
    //console.log(email,password)
    collection.findOne({"email":email}, (err, user) => {
      if (err) throw err
      if (user == null) return done(null,false,{message:"No user"})
      bcrypt.compare(password,user.hash, (err,result) => {
        if (err) throw err
        if (result) return done(null,user)
        return done(null,false,{message:"Bad password"})
      })
    })
  }

  passport.use(new LocalStrategy({ usernameField: 'email' }, authenticateUser))
  passport.serializeUser((user, done) => done(null, user._id))
  passport.deserializeUser((_id, done) => {
    //console.log(_id)
    //console.log(typeof(_id))
    collection.findOne({"_id" : ObjectId(_id)}, (err, user) => {
      //console.log(user)
      if (err) throw err
      if (user == null)  return done(null,undefined)
      return done(null,user)
    })
  })
}

module.exports = initialize