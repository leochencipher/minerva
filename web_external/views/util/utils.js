function generateSequence(start, stop, count) {
    // Generates a sequence of numbers with the given
    // start, stop and count variables

    var sequence = [];
    var step = (stop - start) / (count - 1.0);
    for (var i = 0; i < count; i++) {
        sequence.push(parseFloat(start + i * step));
    }
    return sequence;
}

export { generateSequence };
