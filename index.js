import { XMLParser } from 'fast-xml-parser';
import yargs from 'yargs/yargs';
import { readFileSync } from 'fs';
import get from 'lodash.get';

// Specify the Help information using "yargs" library
let argv = yargs(process.argv.slice(2))
  .usage('Usage: $0 [options]')
  .example('$0 -f my_project.fcpxml', 'exports the chapter marker timestamps from the given file')
  .alias('f', 'file')
  .nargs('f', 1)
  .describe('f', 'Specify the Final Cut Pro X project XML file to export chapter marker timestamps from to YouTube')
  .demandOption(['f'])
  .help('h')
  .alias('h', 'help')
  .epilog('copyright 2023')
  .argv;


/**
 * Calculate the number of seconds represented by the rational number.
 * 
 * @param {String} rationalNumberString Takes a string of format `number/number`s (eg. 123456789/7500s)
 * @returns the calculated number of seconds
 */  
function convertRationalNumber(rationalNumberString) {
  if (typeof rationalNumberString !== 'string' || !rationalNumberString) {
    rationalNumberString = '';
  }
  let rationalParts = rationalNumberString.replace(/s$/, '').split('/');
  if (!rationalParts || !Array.isArray(rationalParts) || rationalParts.length !== 2) {
    return 0;
  }
  return parseInt(rationalParts[0]) / parseInt(rationalParts[1]);
}

/**
 * Returns the HH:MM:SS representing the relative time in the video where this Chapter Marker
 * begins.
 * 
 * @param {Object} chapter a Javascript Object with the chapter properties 
 */
function calculateChapterTime(chapter) {
  // A chapter-marker has a name and start time. In order to get the actual relative time in
  // the video, one needs to calculate relative to the information in the asset clip
  //
  // 1. First subtract the `assetStart` from the `start` to see how much into the current
  //    asset clip the chapter marker goes.
  // 2. Add this to the `assetOffset` to get the relative seconds from the beginning of video
  // 3. Convert the seconds to the HH:MM:SS format.
  let chapterStart = convertRationalNumber(chapter.start);
  let assetStart = convertRationalNumber(chapter.assetStart);
  let assetOffset = convertRationalNumber(chapter.assetOffset);
  if (chapterStart < assetStart) {
    // Chapter markers can't be before the actual asset. Not sure how this happens in Final Cut Pro.
    return null;
  }
  let chapterOffset = Math.floor(chapterStart - assetStart + assetOffset);
  let seconds = chapterOffset % 60;
  let minutes = ((chapterOffset - seconds) / 60) % 60;
  let hours = (chapterOffset - seconds - (minutes * 60)) / 3600;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const xmlFile = readFileSync(argv.file);
const options = {
  ignoreAttributes : false
};
const parser = new XMLParser(options);
const json = parser.parse(xmlFile);
const chapters = [ ]; // used to store the gathered data on chapter markers
// Look through all the `asset-clip` and `ref-clip` elements for `chapter-marker` children
let assetClips = get(json, `fcpxml.library.event.project.sequence.spine['asset-clip']`, []);
if (assetClips && !Array.isArray(assetClips)) {
  assetClips = [ assetClips ];
}
let refClips = get(json, `fcpxml.library.event.project.sequence.spine['ref-clip']`, []);
if (refClips && !Array.isArray(refClips)) {
  refClips = [ refClips ];
}
const clips = [ ...assetClips, ...refClips  ];
clips.forEach(clip => {
  if (!clip.hasOwnProperty('chapter-marker')) {
    return;
  }
  if (Array.isArray(clip['chapter-marker'])) {
    // Multiple chapter-markers in this asset-clip/ref-clip.
    clip['chapter-marker'].forEach(chapterMarker => {
      // console.log(`chapter-marker: name: ${chapterMarker['@_value']}, start ${chapterMarker['@_start']}, asset-offset: ${clip['@_offset']}, asset-start: ${clip['@_start']}`);
      chapters.push({
        name: chapterMarker['@_value'],
        start: chapterMarker['@_start'],
        assetOffset: clip['@_offset'],
        assetStart: clip['@_start']
      });
    });
  }
  else {
    // console.log(`chapter-marker: name: ${clip['chapter-marker']['@_value']}, start ${clip['chapter-marker']['@_start']}, asset-offset: ${clip['@_offset']}, asset-start: ${clip['@_start']}`);
    chapters.push({
      name: clip['chapter-marker']['@_value'],
      start: clip['chapter-marker']['@_start'],
      assetOffset: clip['@_offset'],
      assetStart: clip['@_start']
    });
  }
});

let outputTimes = [ ];
chapters.forEach(chapter => {
  let chapterTime = calculateChapterTime(chapter);
  if (!chapterTime) {
    // Invalid chapter - ignore
    return;
  }
  outputTimes.push(`${calculateChapterTime(chapter)} ${chapter.name}`);
});
// We have to sort the times because we process the `asset-clip` and `ref-clip` separately (i.e. not in original order)
outputTimes.sort().forEach(chapterTime => {
  console.log(chapterTime);
});
