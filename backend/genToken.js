const jwt = require('jsonwebtoken');
const JWT_SECRET = 'mikrodcap-secure-auth-secret-1781870929';
const payload = {
    userId: 1780494557796,
    restaurantId: 'rahlah-691',
    role: 'owner',
    pv: 1
};
const token = jwt.sign(payload, JWT_SECRET);
console.log(token);
