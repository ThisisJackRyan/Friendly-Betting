import { leaveForBilling } from './billingRedirect';

test('follows only https URLs', () => {
  const assign = jest.fn();
  const original = window.location;
  delete window.location;
  window.location = { assign };
  try {
    expect(leaveForBilling('javascript:alert(1)')).toBe(false);
    expect(leaveForBilling('http://checkout.stripe.com/x')).toBe(false);
    expect(leaveForBilling(undefined)).toBe(false);
    expect(assign).not.toHaveBeenCalled();
    expect(leaveForBilling('https://checkout.stripe.com/c/pay/cs_test_1')).toBe(true);
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1');
  } finally {
    window.location = original;
  }
});
