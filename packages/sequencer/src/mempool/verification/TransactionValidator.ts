import { inject, injectable } from "tsyringe";
import {
  MethodIdResolver,
  MethodParameterDecoder,
  Runtime,
  RuntimeModulesRecord,
} from "@proto-kit/module";

import { PendingTransaction } from "../PendingTransaction";

@injectable()
export class TransactionValidator {
  public constructor(
    @inject("Runtime") private readonly runtime: Runtime<RuntimeModulesRecord>,
    @inject("MethodIdResolver")
    private readonly methodIdResolver: MethodIdResolver
  ) {}

  private validateMethod(tx: PendingTransaction): string | undefined {
    // Check if method exists

    // We don't actually need to use runtime.getMethodById here, bcs the
    // module name validation happens inside getMethodNameFromId
    // and also in the next step
    const methodPath = this.methodIdResolver.getMethodNameFromId(
      tx.methodId.toBigInt()
    );

    if (methodPath === undefined) {
      return `Method with id ${tx.methodId} does not exist`;
    }

    // Check if parameters are decodable
    const runtimeModule = this.runtime.resolve(methodPath[0]);
    const decoder = MethodParameterDecoder.fromMethod(
      runtimeModule,
      methodPath[1]
    );

    // We don't do additional checks for args yet - so the only thing we
    // can check is if the Field[]'s length matches
    if (tx.args.length !== decoder.fieldSize) {
      return "Arguments field length doesn't match required length";
    }
    return undefined;
  }

  public validateTx(tx: PendingTransaction): [boolean, string | undefined] {
    const methodError = this.validateMethod(tx);

    if (methodError !== undefined) {
      return [false, methodError];
    }

    const validSignature = tx.signature.verify(
      tx.sender,
      tx.getSignatureData()
    );

    if (!validSignature.toBoolean()) {
      return [false, "Signature provided is not valid"];
    }

    return [true, undefined];
  }
}