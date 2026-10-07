// TODO(notify): plug the SMS provider in here. Resolve once the provider has
// accepted the message; throw on failure (deliverResultTexts never retries).
//
// Until then every send throws. deliverResultTexts claims each number by
// deleting it before sending, so while this is a TODO the saved numbers are
// still deleted at settle and counted as failed. That is temporary on purpose:
// a number is never kept longer than the bet it was saved for.
export async function sendResultSms(e164, body) {
  const err = new Error('SMS provider is not configured.');
  err.code = 'sms-not-configured';
  throw err;
}
