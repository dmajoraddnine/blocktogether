'use strict';
(function() {

var logger = require('./setup').logger,
    twitter = require('./setup').twitter;

/**
 * Ask Twitter to verify a user's credentials. If they are not valid,
 * store the current time in user's deactivatedAt. If they are valid, clear
 * the user's deactivatedAt. Save the user to DB if it's changed.
 * A user can be deactivated because of suspension, deactivation, or revoked
 * app. Each of these states (even revocation!) can be undone, and we'd
 * like the app to resume working normally if that happens. So instead of
 * deleting the user when we get one of these codes, store a 'deactivatedAt'
 * timestamp on the user object. Users with a non-null deactivatedAt
 * get their credentials retried once per day for 30 days, after which (TODO)
 * they should be deleted. Regular operations like checking blocks or
 * streaming are not performed for users with non-null deactivatedAt.
 *
 * The Twitter API provides /account/verify_credentials for this purpose, but
 * that endpoint does not provide information on whether the user is suspended.
 * Instead, /users/show.json for the user's own uid will tell us all of
 * suspended, deactivated, or revoked. A deactivated user will return 404 (and
 * Twitter error code 34) to that call. A user who revoked the app will return
 * 401 (and Twitter error code 89). And a suspended user will return 200, but
 * will have suspended: true in the response body.
 *
 * See https://github.com/jsha/blocktogether/issues/146 for details.
 */
function verifyCredentials(user) {
  twitter.users('show', {
    user_id: user.uid
    }, user.access_token,
    user.access_token_secret, function(err, response) {
      if (err && err.statusCode === 401) {
        logger.warn('User', user, 'revoked app.');
        user.deactivatedAt = new Date();
      } else if (err && err.statusCode === 404) {
        logger.warn('User', user, 'deactivated.')
        user.deactivatedAt = new Date();
      } else if (err && err.statusCode) {
        logger.warn('User', user, '/account/verify_credentials', err.statusCode);
      } else if (err) {
        logger.warn('User', user, '/account/verify_credentials', err);
      } else if (response.suspended === true) {
        logger.warn('User', user, 'suspended.')
        user.deactivatedAt = new Date();
      } else {
        logger.info('User', user, 'has not revoked app, deactivated, or been suspended.');
        user.deactivatedAt = null;
      }
      if (user.changed()) {
        user.save().error(function(err) {
          logger.error(err);
        });
      }
  });
}

module.exports = verifyCredentials;

})();
