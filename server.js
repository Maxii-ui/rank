var express = require('express')
var rbx = require('noblox.js')
var fs = require('fs')
var crypto = require('crypto')
var validator = require('validator')
var bodyParser = require('body-parser')
var Promise = require('bluebird')

var app = express()
var port = process.env.PORT || 8080
var settings = require('./settings.json')
var key = settings.key
var maximumRank = settings.maximumRank || 255
const COOKIE = settings.cookie

app.set('env', 'production')

var _setRank = rbx.setRank

rbx.setRank = function (opt) {
  var rank = opt.rank
  if (rank > maximumRank) {
    return Promise.reject(new Error('New rank ' + rank + ' is above rank limit ' + maximumRank))
  } else {
    return _setRank(opt)
  }
}

var inProgress = {}
var completed = {}

var dir = './players'

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir)
}

fs.readdirSync('./players').forEach(function (file) { // This is considered a part of server startup and following functions could error anyways if it isn't complete, so using synchronous instead of asynchronous is very much intended.
  completed[file] = true
})

function sendErr (res, json, status) {
  res.json(json)
}

function validatorType (type) {
  switch (type) {
    case 'int':
      return validator.isInt
    case 'safe_string':
      return validator.isAlphanumeric
    case 'boolean':
      return validator.isBoolean
    case 'string':
      return function (value) {
        return typeof value === 'string'
      }
    default:
      return function () {
        return true
      }
  }
}

function processType (type, value) {
  switch (type) {
    case 'int':
      return parseInt(value, 10)
    case 'boolean':
      return (value === 'true')
    default:
      return value
  }
}

function verifyParameters (res, validate, requiredFields, optionalFields) {
  var result = {}
  if (requiredFields) {
    for (var index in requiredFields) {
      var type = requiredFields[index]
      var use = validatorType(type)

      var found = false
      for (var i = 0; i < validate.length; i++) {
        var value = validate[i][index]
        if (value) {
          if (use(value)) {
            result[index] = processType(type, value)
            found = true
          } else {
            sendErr(res, {error: 'Parameter "' + index + '" is not the correct data type.', id: null})
            return false
          }
          break
        }
      }
      if (!found) {
        sendErr(res, {error: 'Parameter "' + index + '" is required.', id: null})
        return false
      }
    }
  }
  if (optionalFields) {
    for (index in optionalFields) {
      type = optionalFields[index]
      use = validatorType(type)
      for (i = 0; i < validate.length; i++) {
        value = validate[i][index]
        if (value) {
          if (use(value)) {
            result[index] = processType(type, value)
          } else {
            sendErr(res, {error: 'Parameter "' + index + '" is not the correct data type.', id: null})
            return false
          }
          break
        }
      }
    }
  }
  return result
}

function authenticate (req, res, next) {
  if (req.body.key === key) {
    next()
  } else { var path = './players/' + uid
    var complete = completed[uid]
    var progress = inProgress[uid]
    if (complete) {
      fs.stat(path, function (err) {
        if (err) {
          next(err)
        } else {
          res.append('Content-Type', 'application/json')
          res.write('{"error":null,"data":{"progress":100,"complete":true,')
          var stream = fs.createReadStream(path)
          var first = true
          stream.on('data', function (data) {
            if (first) {
              first = false
              res.write(data.toString().substring(1))
            } else {
              res.write(data)
            }
          })
          stream.on('end', function () {
            res.end('}')
          })
        }
      })
    } else if (progress) {
      sendErr(res, {error: 'Job is still processing', data: {complete: false, progress: progress()}}, 200)
    } else {
      fail()
    }
  } else {
    fail()
  }
})

app.use(function (err, req, res, next) {
  console.error(err.stack)
  sendErr(res, {error: 'Internal server error'})
})

function login () {
  return rbx.cookieLogin(COOKIE)
}
login().then(function () {
  app.listen(port, function () {
    console.log('Listening on port ' + port)
  })
})
  .catch(function (err) {
    var errorApp = express()
    errorApp.get('/*', function (req, res, next) {
      res.json({error: 'Server configuration error: ' + err.message})
    })
    errorApp.listen(port, function () {
      console.log('Configuration error page listening')
    })
  })