# Outbound Message Generation in FunC Contracts

Below is a high-level explanation of where extra outbound messages are generated in these FunC contracts and why you can sometimes end up with five (or more) outgoing messages in a single transaction.

The key point is that under the **bonding_curve** variant, extra steps are performed during a swap that cause two additional messages (beyond the typical “send to user”, “send to referral”, etc.).

---

## 1) Normal “swap” path in a non-bonding-curve pool

For a typical (non-bonding-curve) pool (e.g. **constant_product**), the router’s swap logic (`router.fc → handle_router_messages(), case op::swap`) may create up to three outbound messages:

- One message pays out the purchased tokens to the user, using something like `router::pay_to(to_user, …)`.
- Optionally one message sends a referral fee if `ref_address` is set, calling `pay_vault(...)` or `pay_to(...)` for that referral.
- If any error or slip check fails, instead it sends the “refund” message, returning the tokens to the user (also via `router::pay_to`), but that replaces the normal `pay_to`, it doesn’t add more to it.

**So in the “typical” scenario without bonding-curve logic, you’ll usually see:**

- Possibly 1 message to user
- Possibly 1 message to referral
- Or 1 “refund” message if it fails

➡️ That might be up to **two or three total outbound messages** in a single swap transaction.

---

## 2) Additional logic in the “bonding_curve” scenario

When `dexType = "bonding_curve"`, the swap code in `pool/pools/bonding_curve/pool.fc` and in `router/pools/bonding_curve` adds **two extra steps** during `handle_router_messages() → op::swap`:

1. `burn_fee(...)` call
2. `send_reward(...)` call

If you look at `router.fc` (the large swap code in `handle_router_messages()`), specifically inside the large `try` block that does `get_swap_out(...)`, you will see:

```cpp
// (Within the conditional block that handles “bonding_curve”)
burn_fee(burn0, burn1);        //  → This itself sends a router::pay_to(...) message
send_reward(reward0, reward1); //  → This again sends a router::pay_to(...) message

