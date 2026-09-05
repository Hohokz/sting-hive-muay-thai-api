const { DataTypes } = require('sequelize');

// Single source of truth for enum-like values shared across models and services.
// Use the plain objects below in application code (e.g. BOOKING_STATUS.CANCELED)
// instead of raw string literals. The matching `_TYPE` exports are Sequelize
// column types built from the same values, for use in model definitions.

const BOOKING_STATUS = {
    PENDING: 'PENDING',
    SUCCEED: 'SUCCEED',
    FAILED: 'FAILED',
    CANCELED: 'CANCELED',
    RESCHEDULED: 'RESCHEDULED',
    PAYMENTED: 'PAYMENTED', // TODO(tech-debt): should be "PAID" — renaming this live Postgres enum value needs a migration
};

const PAYMENT_METHOD = { UNPAY: 'UNPAY', PAID: 'PAID' };
const PAYMENT_STATUS = { PENDING: 'PENDING', PAID: 'PAID', CANCEL: 'CANCEL', ERROR: 'ERROR' };
const GYM_ENUM = { STING_CLUB: 'STING_CLUB', STING_HIVE: 'STING_HIVE' };
const USER_ROLE = { ADMIN: 'ADMIN', USER: 'USER' };

module.exports = {
    BOOKING_STATUS,
    PAYMENT_METHOD,
    PAYMENT_STATUS,
    GYM_ENUM,
    USER_ROLE,

    BOOKING_STATUS_TYPE: DataTypes.ENUM(...Object.values(BOOKING_STATUS)),
    PAYMENT_METHOD_TYPE: DataTypes.ENUM(...Object.values(PAYMENT_METHOD)),
    PAYMENT_STATUS_TYPE: DataTypes.ENUM(...Object.values(PAYMENT_STATUS)),
    GYM_ENUM_TYPE: DataTypes.ENUM(...Object.values(GYM_ENUM)),
    USER_ROLE_TYPE: DataTypes.ENUM(...Object.values(USER_ROLE)),
};
