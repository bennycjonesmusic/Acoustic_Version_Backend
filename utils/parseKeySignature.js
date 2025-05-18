function parseKeySignature(keySig){

    //function to parse key signatures!

keySig = keySig.toUpperCase();
//keep key signature uniform by pushing to argument to uppercase

const invalid = ["E#", "B#", "Fb", "Cb"]; //flag invalid signatures

if (invalid.includes(keySig)){

    throw new Error("Remember E and B don't have sharps. This means F doesn't have a flat, and neither does C")
}


let isFlat = false;
let isSharp = false;
let key = keySig;




if (keySig.endsWith('b')){

    isFlat = true; //if keysig has b at the end, it is flat
    key = key.slice(0, - 1); //eliminate b from keySig arg.

}

if (keySig.endsWith('#')){

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