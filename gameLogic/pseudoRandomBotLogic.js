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
    const openedCellIds = openedCells.map(cell => cell.bubbleImg);

    let filteredCells = [...allCells];

    if (knownBubbleId !== null) {
        filteredCells[knownBubbleId] = -1;
    }

    const availableCells = knownBubbleId ? allCells.filter(cell => !openedCellIds.includes(cell) && cell !== knownBubbleValue) : allCells.filter(cell => !openedCellIds.includes(cell));

    console.log(`availableCells: ${availableCells.length}`);

    if (availableCells.length === 0) {
        throw new Error("No availableCells");
    }

    const [shouldFindDuplicate, newLastSuccessfulAttempt] = pseudoRandomChoice(lastSuccessfulAttempt);

    if (knownBubbleValue !== null) {
        const duplicateIndex = filteredCells.findIndex(cell => cell === knownBubbleValue);
        if (allCells[duplicateIndex] !== knownBubbleValue) {
        }

        if (duplicateIndex !== -1) {
            return [duplicateIndex, newLastSuccessfulAttempt];
        }
    }

    return [availableCells[Math.floor(Math.random() * availableCells.length)], newLastSuccessfulAttempt];
}


module.exports = {
    chooseCell
}