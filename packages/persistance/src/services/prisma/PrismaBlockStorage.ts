import {
  HistoricalUnprovenBlockStorage,
  TransactionExecutionResult,
  UnprovenBlock,
  UnprovenBlockMetadata,
  UnprovenBlockQueue,
  UnprovenBlockStorage,
  UnprovenBlockWithPreviousMetadata,
} from "@proto-kit/sequencer";
import {
  Prisma,
  TransactionExecutionResult as DBTransactionExecutionResult,
} from "@prisma/client";
import { inject, injectable } from "tsyringe";

import type { PrismaDatabaseConnection } from "../../PrismaDatabaseConnection";

import {
  TransactionExecutionResultMapper,
  TransactionMapper,
} from "./mappers/TransactionMapper";
import { UnprovenBlockMetadataMapper } from "./mappers/UnprovenBlockMetadataMapper";
import { BlockMapper } from "./mappers/BlockMapper";

@injectable()
export class PrismaBlockStorage
  implements
    UnprovenBlockQueue,
    UnprovenBlockStorage,
    HistoricalUnprovenBlockStorage
{
  public constructor(
    @inject("Database") private readonly connection: PrismaDatabaseConnection,
    private readonly transactionResultMapper: TransactionExecutionResultMapper,
    private readonly transactionMapper: TransactionMapper,
    private readonly blockMetadataMapper: UnprovenBlockMetadataMapper,
    private readonly blockMapper: BlockMapper
  ) {}

  private async getBlockByQuery(
    where: { height: number } | { parent: null } | { transactionsHash: string }
  ): Promise<UnprovenBlock | undefined> {
    const result = await this.connection.client.block.findFirst({
      where,
      include: {
        transactions: {
          include: {
            tx: true,
          },
        },
      },
    });
    if (result === null) {
      return undefined;
    }
    const transactions = result.transactions.map<TransactionExecutionResult>(
      (txresult) => {
        return this.transactionResultMapper.mapIn([txresult, txresult.tx]);
      }
    );
    return {
      ...this.blockMapper.mapIn(result),
      transactions,
    };
  }

  public async getBlockAt(height: number): Promise<UnprovenBlock | undefined> {
    return await this.getBlockByQuery({ height });
  }

  public async getBlock(
    transactionsHash: string
  ): Promise<UnprovenBlock | undefined> {
    return await this.getBlockByQuery({ transactionsHash });
  }

  public async pushBlock(block: UnprovenBlock): Promise<void> {
    console.log(`Pushing block`, block.transactions.map(x => x.tx.hash().toString()))

    const transactions = block.transactions.map<DBTransactionExecutionResult>(
      (tx) => {
        const encoded = this.transactionResultMapper.mapOut(tx);
        return {
          ...encoded[0],
          blockHash: block.transactionsHash.toString(),
        };
      }
    );

    const encodedBlock = this.blockMapper.mapOut(block);

    await this.connection.client.$transaction([
      this.connection.client.transaction.createMany({
        data: block.transactions.map((txr) =>
          this.transactionMapper.mapOut(txr.tx)
        ),
      }),

      this.connection.client.block.create({
        data: {
          ...encodedBlock,
          networkState: encodedBlock.networkState as Prisma.InputJsonObject,

          transactions: {
            createMany: {
              data: transactions.map((tx) => {
                return {
                  status: tx.status,
                  statusMessage: tx.statusMessage,
                  txHash: tx.txHash,

                  stateTransitions:
                    tx.stateTransitions as Prisma.InputJsonArray,
                  protocolTransitions:
                    tx.protocolTransitions as Prisma.InputJsonArray,
                };
              }),
            },
          },

          batchHeight: undefined,
        },
      }),
    ]);
  }

  public async pushMetadata(metadata: UnprovenBlockMetadata): Promise<void> {
    const encoded = this.blockMetadataMapper.mapOut(metadata);

    await this.connection.client.unprovenBlockMetadata.create({
      data: {
        resultingNetworkState:
          encoded.resultingNetworkState as Prisma.InputJsonValue,

        resultingStateRoot: encoded.resultingStateRoot,
        blockTransactionHash: encoded.blockTransactionHash,
      },
    });
  }

  // TODO Phase out and replace with getLatestBlock().network.height
  public async getCurrentBlockHeight(): Promise<number> {
    const result = await this.connection.client.block.aggregate({
      _max: {
        height: true,
      },
    });
    // TODO I have no idea what this should give in case no blocks are in the DB. Document properly
    return (result?._max.height ?? -1) + 1;
  }

  public async getLatestBlock(): Promise<UnprovenBlock | undefined> {
    return this.getBlockByQuery({ parent: null });
  }

  public async getNewestMetadata(): Promise<UnprovenBlockMetadata | undefined> {
    const latestBlock = await this.getLatestBlock();

    if (latestBlock === undefined) {
      return undefined;
    }

    const result = await this.connection.client.unprovenBlockMetadata.findFirst(
      {
        where: {
          blockTransactionHash: latestBlock.transactionsHash.toString(),
        },
      }
    );

    if (result === null) {
      return undefined;
    }

    return this.blockMetadataMapper.mapIn(result);
  }

  public async getNewBlocks(): Promise<UnprovenBlockWithPreviousMetadata[]> {
    const blocks = await this.connection.client.block.findMany({
      where: {
        batch: null,
      },
      include: {
        metadata: true,
      },
      orderBy: {
        height: Prisma.SortOrder.asc,
      },
    });

    return blocks.map((block, index) => {
      const correspondingMetadata = block.metadata;
      return {
        block: this.blockMapper.mapIn(block),
        lastBlockMetadata:
          correspondingMetadata !== null
            ? this.blockMetadataMapper.mapIn(correspondingMetadata)
            : undefined,
      };
    });
  }
}
