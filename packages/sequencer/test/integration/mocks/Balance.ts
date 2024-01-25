import {
  runtimeMessage,
  runtimeMethod,
  runtimeModule,
  RuntimeModule,
  state
} from "@proto-kit/module";
import { log, Presets, range } from "@proto-kit/common";
import {
  Bool,
  Field,
  PublicKey,
  Struct,
  Provable,
  Signature, UInt64
} from "o1js";
import { Admin } from "@proto-kit/module/test/modules/Admin";
import { Option, State, StateMap, assert, Deposit } from "@proto-kit/protocol";

class MyStruct extends Struct({
  a: Provable.Array(Field, 10),
}) {}

@runtimeModule()
export class Balance extends RuntimeModule<object> {
  public static presets = {} satisfies Presets<object>;

  @state() public totalSupply = State.from<UInt64>(UInt64);

  @state() public balances = StateMap.from<PublicKey, UInt64>(
    PublicKey,
    UInt64
  );

  public constructor(public admin: Admin) {
    super();
  }

  @runtimeMessage()
  public deposit(deposit: Deposit) {
    const balance = this.balances.get(deposit.address);
    this.balances.set(deposit.address, balance.value.add(deposit.amount));
  }

  @runtimeMethod()
  public getTotalSupply() {
    this.totalSupply.get();
  }

  // @runtimeMethod()
  // public test(a: UInt64, b: Signature, c: MyStruct, d: Struct<unknown>) {}

  @runtimeMethod()
  public setTotalSupply() {
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    this.totalSupply.set(UInt64.from(20));
    this.admin.isAdmin(this.transaction.sender.value);
  }

  @runtimeMethod()
  public getBalance(address: PublicKey): Option<UInt64> {
    return this.balances.get(address);
  }

  @runtimeMethod()
  public setBalanceIf(address: PublicKey, value: UInt64, condition: Bool) {
    assert(condition, "Condition not met");
    this.balances.set(address, value);
  }

  @runtimeMethod()
  public addBalance(address: PublicKey, value: UInt64) {
    const totalSupply = this.totalSupply.get();
    this.totalSupply.set(totalSupply.orElse(UInt64.zero).add(value));

    const balance = this.balances.get(address);

    log.provable.debug("Balance:", balance.isSome, balance.value);

    const newBalance = balance.orElse(UInt64.zero).add(value);
    this.balances.set(address, newBalance);
  }

  @runtimeMethod()
  public addBalanceToSelf(value: UInt64, blockHeight: UInt64) {
    const address = this.transaction.sender.value;
    const balance = this.balances.get(address);

    log.provable.debug("Sender:", address);
    log.provable.debug("Balance:", balance.isSome, balance.value);
    log.provable.debug("BlockHeight:", this.network.block.height);

    assert(
      blockHeight.equals(this.network.block.height),
      `Blockheight not matching ${blockHeight.toString()} !== ${this.network.block.height.toString()}`
    );

    const newBalance = balance.value.add(value);
    this.balances.set(address, newBalance);
  }

  @runtimeMethod()
  public lotOfSTs(randomArg: Field) {
    range(0, 10).forEach((index) => {
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers
      const pk = PublicKey.from({
        x: randomArg.add(Field(index % 5)),
        isOdd: Bool(false),
      });
      const value = this.balances.get(pk);
      this.balances.set(pk, value.orElse(UInt64.zero).add(100));
      const supply = this.totalSupply.get().orElse(UInt64.zero);
      this.totalSupply.set(supply.add(UInt64.from(100)));
    });
  }
}
