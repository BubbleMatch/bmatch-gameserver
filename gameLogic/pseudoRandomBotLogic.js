//https://dota2.fandom.com/wiki/Random_Distribution
// using legacy data
function pseudoRandomChoice(lastSuccessfulAttempt) {
    const C = 0.05;
    const probability = C * (lastSuccessfulAttempt + 1);

    const randomValue = Math.random();

    if (randomValue <= probability) {
        return [true, 0];
    }

    return [false, lastSuccessfulAttempt + 1];
}

function chooseCell(openedCells, allCells, lastSuccessfulAttempt, knownBubbleValue = null, knownBubbleId = null) {
    const openCellsBubblesImgs = openedCells.map(cell => cell.bubbleImg);

    let filteredCells = [...allCells];

    if (knownBubbleId !== null) {
        filteredCells[knownBubbleId] = -1;
    }

    for (let openImg of openCellsBubblesImgs) {
        const index = filteredCells.indexOf(openImg);
        if (index !== -1) {
            filteredCells[index] = -1;
        }
    }

    const availableCells = filteredCells.map((cell, index) => (cell !== -1) ? index : null).filter(index => index !== null);

    if (availableCells.length === 0) {
        throw new Error("No availableCells");
    }

    const [shouldFindDuplicate, newLastSuccessfulAttempt] = pseudoRandomChoice(lastSuccessfulAttempt);

    if (shouldFindDuplicate && knownBubbleValue !== null) {
        const duplicateIndex = filteredCells.findIndex(cell => cell === knownBubbleValue);

        if (duplicateIndex !== -1) {
            return [duplicateIndex, newLastSuccessfulAttempt];
        }
    }

    let randomIndex = availableCells[Math.floor(Math.random() * availableCells.length)];
    console.log(randomIndex);
    return [randomIndex, newLastSuccessfulAttempt];
}

module.exports = {
    chooseCell
}