import { describe, expect, it } from "vitest";
import { decideByRules } from "../../src/lib/engine/moves";
import { PracticeWalletSchema } from "../../src/lib/engine/schema";
import { detectWalletLeak, digitStream, generateWallet, normalizeSpokenDigits, redact } from "../../src/lib/engine/wallet";

const wallet = generateWallet("test-user");

describe("practice wallet", () => {
  it("is deterministic and schema-valid", () => {
    expect(generateWallet("test-user")).toEqual(wallet);
    expect(PracticeWalletSchema.parse(wallet)).toEqual(wallet);
    expect(wallet.ssn).toMatch(/^9\d{2}-00-\d{4}$/);
    expect(wallet.cardNumber.startsWith("9999 ")).toBe(true);
  });

  it("normalizes spoken digits", () => {
    expect(normalizeSpokenDigits("nine eight double five oh one")).toBe("9 8 55 0 1");
    expect(digitStream("it's four, two, nine and then 13")).toBe("42913");
    expect(normalizeSpokenDigits("o I see")).toBe("o i see");
  });

  it("detects a code read out loud as share_code", () => {
    const spoken = wallet.oneTimeCode
      .split("")
      .map((d) => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][Number(d)])
      .join(" ");
    const leak = detectWalletLeak(`okay the code is ${spoken}`, wallet);
    expect(leak.fields).toContain("code");
    expect(decideByRules(`the code is ${wallet.oneTimeCode}`, wallet)?.move).toBe("share_code");
  });

  it("detects SSN, account and card leaks as disclose", () => {
    expect(decideByRules(`my number is ${wallet.ssn}`, wallet)?.move).toBe("disclose");
    expect(decideByRules(`account ${wallet.accountNumber.slice(-5)}`, wallet)?.move).toBe("disclose");
    expect(decideByRules(`card ends in ${wallet.cardNumber.slice(-4)}`, wallet)?.move).toBe("disclose");
  });

  it("detects date of birth", () => {
    const [month, day] = wallet.dateOfBirth.split(" ");
    expect(detectWalletLeak(`I was born ${month} ${day}`, wallet).fields).toContain("dob");
  });

  it("does not flag refusals or short numbers", () => {
    expect(detectWalletLeak("No. I will not give you any numbers.", wallet).leaked).toBe(false);
    expect(detectWalletLeak("I'm 81 years old", wallet).leaked).toBe(false);
  });

  it("redacts long numbers and emails", () => {
    expect(redact("my ssn is 123-45-6789 ok")).toBe("my ssn is [number removed] ok");
    expect(redact("call 513 555 0199 or mail me at a.b@example.com")).toContain("[number removed]");
    expect(redact("mail me at a.b@example.com")).toContain("[email removed]");
    expect(redact("I have 2 grandkids, born in 1950.")).toBe("I have 2 grandkids, born in 1950.");
    expect(redact(`code ${wallet.oneTimeCode}`, wallet)).toBe("code [practice number]");
    expect(redact("Oh, I see. It is five oh one.")).toBe("Oh, I see. It is 5 0 1.");
  });

  it("rule layer catches hang-ups, safe words and verification", () => {
    expect(decideByRules("I'm hanging up now", wallet)?.move).toBe("hang_up");
    expect(decideByRules("What's our safe word?", wallet)?.move).toBe("ask_safe_word");
    expect(decideByRules("I'll call my bank myself", wallet)?.move).toBe("verify_independent");
    expect(decideByRules("I'll call the number on the back of my card", wallet)?.move).toBe("verify_independent");
    expect(decideByRules("okay, what do I do", wallet)).toBeNull();
  });

  it("never treats bare acknowledgment as a disclosure or specific risky agreement", () => {
    for (const reply of ["Okay, I understand.", "OK", "Yes", "Sure!", "I understand", "All right", "Got it."]) {
      expect(decideByRules(reply, wallet)?.move).toBe("comply_minor");
    }
    for (const reply of ["", ".", "Okay, I will buy the gift cards", "Yes, I will keep this secret"]) {
      expect(decideByRules(reply, wallet)).toBeNull();
    }
    expect(decideByRules(`Okay, the code is ${wallet.oneTimeCode}`, wallet)?.move).toBe("share_code");
  });

  it("honors Practice Call stop phrases only in Practice Call mode", () => {
    expect(decideByRules("stop practice", wallet, "practice_call")?.move).toBe("hang_up");
    expect(decideByRules("unsubscribe", wallet, "practice_call")?.move).toBe("hang_up");
    expect(decideByRules("stop", wallet, "practice_call")?.move).toBe("hang_up");
    expect(decideByRules("stop", wallet)?.move).toBeUndefined();
    expect(decideByRules("stop practice", wallet)?.move).toBeUndefined();
    expect(decideByRules("don't stop", wallet, "practice_call")?.move).toBeUndefined();
    expect(decideByRules("I don't want to stop practice", wallet, "practice_call")?.move).toBeUndefined();
    expect(decideByRules("I don't want to stop practice; unsubscribe", wallet, "practice_call")?.move).toBe("hang_up");
    expect(decideByRules(`stop practice, my code is ${wallet.oneTimeCode}`, wallet, "practice_call")?.move).toBe("hang_up");
  });
});
