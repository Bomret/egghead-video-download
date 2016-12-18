const Promise = require('bluebird')
const program = require('commander')
const mkdirp = require('mkdirp')
const { unlink } = require('fs')
const path = require('path')
const { spawn } = require('child_process')

function collect (current, accu) {
  accu.push(current)
  return accu
}

function parseInteger (str) {
  return parseInt(str, 10)
}

program
  .version('0.5.0')
  .option('-u, --url <url>', 'The egghead.io course url(s)', collect, [])
  .option('-o, --out [out]', 'The output directory [./videos]', path.join(__dirname, 'videos'))
  .option('-c, --max-concurrency [concurrency]', 'The maximal number of concurrent downloads [1]', parseInteger, 1)
  .parse(process.argv)

function mkdir (path) {
  console.log(`Creating folder ${path} if it not exists...`)

  return Promise.fromCallback(cb =>
    mkdirp(path, err => {
      if (err) {
        console.error(`Error creating path ${path}: ${err}.`)
        return cb(err)
      }

      return cb()
    }))
}

function deleteFile (file) {
  console.log(`Deleting ${file}...`)

  return Promise.fromCallback(cb => unlink(file, cb))
}

function run (program, args) {
  console.log(`Running program ${program} with args ${args.join(' ')}`)

  return new Promise((resolve, reject) => {
    const prc = spawn(program, args)

    prc.stdout.setEncoding('utf8')

    prc.stdout.on('data', function (data) {
      var str = data.toString()
      var lines = str.split(/(\r?\n)/g)

      console.log(lines.join(''))
    })

    prc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`Error running ${program}. Got exitcode ${code}.`))
      }

      resolve()
    })
  })
}

function getLinks (course) {
  return run('get-links', ['--url', course.url, '-c', '.title a', '-o', course.linksFile])
}

function downloadVideos (course) {
  return run('youtube-dl', ['-i', '-o', `${course.dir}/%(autonumber)s-%(title)s`, '-a', course.linksFile])
}

function getCourseInfo (url, out) {
  const parts = url.split('/')
  const name = parts[parts.length - 1]
  const dir = path.join(out, name)
  const linksFile = path.join(dir, 'links.txt')

  return {
    name,
    url,
    dir,
    linksFile
  }
}

Promise.try(Promise.coroutine(function* () {
  const courseUrls = program.url
  const targetDir = program.out
  const maxConcurrency = program.maxConcurrency

  console.log('Starting video download.')

  yield Promise.map(courseUrls, Promise.coroutine(function* (url) {
    const course = getCourseInfo(url, targetDir)

    yield mkdir(course.dir)
    yield getLinks(course)
    yield downloadVideos(course)
    yield deleteFile(course.linksFile)
  }), { concurrency: maxConcurrency })

  console.log('Video download finished.')
}))
