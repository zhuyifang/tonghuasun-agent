import assert from "node:assert/strict";
import { matchingSecurityCodes, securitySearchPattern } from "../src/components/shared/securityCode";

const bank = { market: "USZA", code: "000001", name: "平安银行", fullCode: "USZA000001" };
const index = { market: "USHA", code: "000001", name: "上证指数", fullCode: "USHA000001" };
assert.equal(securitySearchPattern(" usza000001 "), "000001");
assert.equal(securitySearchPattern("600519"), "600519");
assert.deepEqual(matchingSecurityCodes(" usza000001 ", [index, bank]), [bank]);
assert.deepEqual(matchingSecurityCodes("000001", [bank, bank]), [bank]);
assert.deepEqual(matchingSecurityCodes("000001", [index, bank]), [index, bank]);
assert.deepEqual(matchingSecurityCodes("600519", [bank]), []);
assert.deepEqual(matchingSecurityCodes("", []), []);
process.stdout.write("纯股票代码匹配、去重及同码候选检查通过。\n");
