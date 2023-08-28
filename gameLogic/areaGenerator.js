function generateArea() {
    let list = [];
    for(let i = 1; i <= 50; i++) {
        list.push(i, i);
    }
    return list.sort(() => 0.5 - Math.random());
}


module.exports = {
    generateArea
}