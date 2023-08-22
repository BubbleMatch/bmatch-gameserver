const { Client } = require('pg');

const fetchUserById = async (userId, config) => {
    const client = new Client(config);
    try {
        await client.connect();
        const res = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        return res.rows[0];
    } catch (err) {
        throw err;
    } finally {
        await client.end();
    }
};

module.exports = {
    fetchUserById
};
