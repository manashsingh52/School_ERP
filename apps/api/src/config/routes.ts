/** Global API prefix (docs/05 §1). Shared by bootstrap and the route discovery check. */
export const API_PREFIX = 'v1';
/** Controllers served without the prefix (load balancer health checks). */
export const UNPREFIXED_CONTROLLERS = ['health'];
