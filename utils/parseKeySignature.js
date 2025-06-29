function parseKeySignature(keySig){

    //function to parse key signatures!

// Store original for minor detection
const original = keySig;
keySig = keySig.toUpperCase();
//keep key signature uniform by pushing to argument to uppercase

const invalid = ["E#", "B#", "FB", "CB"]; //flag invalid signatures (updated to uppercase)

if (invalid.includes(keySig.replace('M', ''))){

    throw new Error("Remember E and B don't have sharps. This means F doesn't have a flat, and neither does C")
}


let isFlat = false;
let isSharp = false;
let key = keySig;

// Remove minor indicator 'm' from key for parsing
if (keySig.endsWith('M')){
    key = key.slice(0, -1);
}

// Only treat as flat if key is more than one character and ends with 'B'
if (key.length > 1 && key.endsWith('B')){

    isFlat = true; //if keysig has B at the end, it is flat (after uppercase conversion)
    key = key.slice(0, - 1); //eliminate B from keySig arg.

}

if (key.endsWith('#')){

    isSharp = true;
    key = key.slice(0, -1); //eliminate # from keySig arg
}

const validKeys = ["A", "B", "C", "D", "E", "F", "G"]; //list valid keys

if (!validKeys.includes(key)){


    throw new Error(`Invalid key signature: ${keySig}`);
}


return {key, isFlat, isSharp};
}

export {parseKeySignature};