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
    const availableCells = knownBubbleId ? allCells.filter(cell => !openedCells.includes(cell) && cell !== knownBubbleId) : allCells.filter(cell => !openedCells.includes(cell));

    const [shouldFindDuplicate, newLastSuccessfulAttempt] = pseudoRandomChoice(lastSuccessfulAttempt);

    if (shouldFindDuplicate) {
        if (knownBubbleValue) {
            const duplicateIndex = availableCells.findIndex(cell => allCells[cell] === knownBubbleValue);
            if (duplicateIndex !== -1) return [availableCells[duplicateIndex], newLastSuccessfulAttempt];
        } else {
            const duplicateCell = findDuplicate(availableCells, allCells, openedCells);
            if (duplicateCell) return [duplicateCell, newLastSuccessfulAttempt];
        }
    }

    return [availableCells[Math.floor(Math.random() * availableCells.length)], newLastSuccessfulAttempt];
}

function findDuplicate(availableCells, allCells, openedCells) {
    for (const cell of openedCells) {
        const duplicateIndexes = allCells.reduce((acc, el, idx) => el === cell ? acc.concat(idx) : acc, []);
        const availableDuplicates = duplicateIndexes.filter(idx => availableCells.includes(allCells[idx]));

        if (availableDuplicates.length > 0) return allCells[availableDuplicates[0]];
    }
    return null;
}


module.exports = {
    chooseCell
}