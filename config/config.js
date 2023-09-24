const postgreSQLUser = process.env.POSTGRES_USER || 'bmatch';
const postgreSQLPassword = process.env.POSTGRES_PASSWORD || 'newpassword';
const postgreSQLDatabase = process.env.POSTGRES_DB || 'bmatch';
const isProduction = process.env.IS_PROD || 'false';

const rabbitMQUser = process.env.RABBITMQ_USER || 'bmatch';
const rabbitMQPassword = process.env.RABBITMQ_PASSWORD || 'newpassword';

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

    if (isProduction == 'true'){
        return {
            host: postgreSQL.ServiceAddress,
            port: postgreSQL.ServicePort,
            user: postgreSQLUser,
            password: postgreSQLPassword,
            database: postgreSQLDatabase
        };

    }

    return {
        host: postgreSQL.Address,
        port: postgreSQL.ServicePort,
        user: postgreSQLUser,
        password: postgreSQLPassword,
        database: postgreSQLDatabase
    };
};

const getRabbitMQConfig = async (consul) => {
    let nodes = await consul.catalog.service.nodes('rabbitmq');
    let consulNode = nodes[0];

    if (consulNode === undefined) {
        console.log("RabbitMQ service not found in consul");
        process.exit(0);
    }

    if (isProduction == 'true'){
        return {
            host: consulNode.ServiceAddress,
            port: consulNode.ServicePort,
            user: rabbitMQUser,
            pass: rabbitMQPassword
        };
    }

    return {
        host: consulNode.Address,
        port: consulNode.ServicePort,
        user: rabbitMQUser,
        pass: rabbitMQPassword
    };
};

const getRedisConfig = async (consul) => {
    let production = await consul.catalog.service.nodes('redis');
    let consulNode = production[0];

    if (consulNode === undefined) {
        console.log("consul service not found in consul");
        process.exit(0);
    }

    if (isProduction == 'true'){
        return {
            host: consulNode.ServiceAddress,
            port: consulNode.ServicePort
        };
    }

    return {
        host: consulNode.Address,
        port: consulNode.ServicePort
    };
};

module.exports = {
    user: postgreSQLUser, password: postgreSQLPassword, database: postgreSQLDatabase, consulHost, consulPort, getPostgresConfig, getRedisConfig, JWTToken, getRabbitMQConfig
};
