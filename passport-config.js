const LocalStrategy = require('passport-local').Strategy
const bcrypt = require('bcrypt')
const SALT = require('./server').SALT;
const ObjectId = require('mongodb').ObjectID;

function initialize(passport, collection) {
  const authenticateUser = (email, password, done) => {
    // Find a user with the given email
    collection.findOne({"email":email}, (err, user) => {
      if (err) throw err
      // If no such user exists, return false
      if (user == null) return done(null,false,{message:"No user"})
      // Compare the found users password hash with the given password
      bcrypt.compare(password,user.hash, (err,result) => {
        if (err) throw err
        if (result) return done(null,user) // If the given password matches, return the user data
        return done(null,false,{message:"Bad password"})
      })
    })
  }

  passport.use(new LocalStrategy({ usernameField: 'email' }, authenticateUser))
  passport.serializeUser((user, done) => done(null, user._id))
  passport.deserializeUser((_id, done) => {
    collection.findOne({"_id" : ObjectId(_id)}, (err, user) => {
      if (err) throw err
      if (user == null)  return done(null,undefined)
      return done(null,user)
    })
  })
}

module.exports = initialize