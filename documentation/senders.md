# Outbound Message Senders Explained

Below is a high-level explanation of where extra outbound messages are generated in these FunC contracts and why you can sometimes end up with five (or more) outgoing messages in a single transaction. The key point is that under the “bonding_curve” variant, extra steps are performed during a swap that cause two additional messages (beyond the typical “send to user”, “send to referral”, etc.):

---

## 1) Normal “swap” path in a non-bonding-curve pool

For a typical (non-bonding-curve) pool (e.g. “constant_product”), the router’s swap logic (in router.fc → handle_router_messages(), case op::swap) may create up to three outbound messages:

• One message pays out the purchased tokens to the user, using something like router::pay_to(to_user, …).  
• Optionally one message sends a referral fee if ref_address is set, calling pay_vault(...) or pay_to(...) for that referral.  
• If any error or slip check fails, instead it sends the “refund” message (returning the tokens to the user), which replaces the normal pay_to, rather than adding an extra one.

Hence, in the “typical” scenario without the extra bonding-curve logic, you’ll usually see:
- Possibly 1 message to the user
- Possibly 1 message to the referral
- Or 1 “refund” message if the swap fails

So that might be up to two or three total outbound message calls in a single swap transaction.

---

## 2) Additional logic in the “bonding_curve” scenario

When dexType = "bonding_curve," the swap code in pool/pools/bonding_curve/pool.fc and in router/pools/bonding_curve adds two extra steps during `handle_router_messages()` in router.fc → `op::swap` block:

1) burn_fee(...) call
2) send_reward(...) call

If you look at router.fc (the large swap code in `handle_router_messages()`), specifically inside the large try block that does `get_swap_out(...)`, you will see something like:

```c
// (Within the conditional block that handles “bonding_curve”)
burn_fee(burn0, burn1);        // → This itself sends a router::pay_to(...) message
send_reward(reward0, reward1); // → This again sends a router::pay_to(...) message
```

Those two functions each produce a separate outbound message. Internally, they do something like:
```c
msgs::send_simple(
  get_pay_to_wallet_fee(),
  ctx.at(SENDER),
  router::pay_to(... burn_fee_ok or reward_ok ...),
  NORMAL
);
```

Thus, if you already have:
• A normal “pay_to” for the swapped tokens to the user  
• A referral “pay_vault” or “pay_to” for referral fees  
• The above `burn_fee(...) → pay_to(...)` message  
• The above `send_reward(...) → pay_to(...)` message

… you end up with four distinct outbound messages. If a final factor (like an error, or something else) triggers another message, you can climb to five.

In practice, on a bonding-curve swap with a referral set, you might see:

1) pay_vault(...) or pay_to(...) → referral address
2) pay_to(...) → user’s swapped tokens
3) pay_to(...) → burn_fee(...)
4) pay_to(...) → send_reward(...)  
   (And if there is an additional partial error or leftover, possibly #5)

---

## 3) Why you see more messages under high-fee (ION) conditions

Because your ION fork charges higher forward_fees, some of these code paths require further splitting of the gas among multiple subcalls. The bonding-curve logic intentionally issues separate messages for “burn fee” and “creator reward.” Each extra step is a separate `messages::send_simple(...)` call. Therefore, in the logs, you see more than the usual 2–3 messages; you can see up to 4 or 5 total.

---

## Summary

• The bonding-curve version of the router adds two extra message-sends inside `handle_router_messages() → op::swap` (`burn_fee` and `send_reward`).  
• When combined with the normal user payout and optional referral payout, you can have 4 or 5 messages.  
• In ION (with higher fees), it is more pronounced because:  
(a) you see the big forward_fees  
(b) the code splits out separate messages to ensure each piece has enough gas

Hence, that is where your “5 outgoing messages” symptom comes from: essentially the bonding-curve variant’s extra calls to `burn_fee(...)` and `send_reward(...)` within the swap logic.

