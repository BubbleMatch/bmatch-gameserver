const user = process.env.POSTGRES_USER || 'bmatch';
const password = process.env.POSTGRES_PASSWORD || 'newpassword';
const database = process.env.POSTGRES_DB || 'bmatch';
const consulHost = process.env.CONSUL_HOST || 'localhost';
const consulPort = process.env.CONSUL_PORT || '8500';
const JWTToken = process.env.JWT_TOKEN || 'YourSecretKeyShouldBeVerySecureAndNotPublic';

const getPostgresConfig = async (consul) => {
    let production = await consul.catalog.service.nodes('postgres');
    let postgreSQL = production[0];

    if (postgreSQL === undefined) {
        console.log("postgres service not found in consul");
        process.exit(0);
    }

    return {
        host: postgreSQL.Address,
        port: postgreSQL.ServicePort,
        user: user,
        password: password,
        database: database
    };
};

const getRedisConfig = async (consul) => {
    let production = await consul.catalog.service.nodes('redis');
    let consulNode = production[0];

    if (consulNode === undefined) {
        console.log("consul service not found in consul");
        process.exit(0);
    }

    return {
        host: consulNode.Address,
        port: consulNode.ServicePort
    };
};

module.exports = {
    user, password, database, consulHost, consulPort, getPostgresConfig, getRedisConfig, JWTToken
};
