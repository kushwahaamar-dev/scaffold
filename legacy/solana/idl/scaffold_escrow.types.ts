/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/scaffold_escrow.json`.
 */
export type ScaffoldEscrow = {
  "address": "4dUWewdZ6q1wXD8YxLJFrhWqqp6Gnk7TrXSD8WqDAMnG",
  "metadata": {
    "name": "scaffoldEscrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Checkpoint-weighted USDC escrow for Scaffold demo"
  },
  "instructions": [
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "account",
                "path": "escrow.nonce",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "buyerAta",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "finalizeJob",
      "docs": [
        "Once the deadline has passed or all checkpoints have been fully scored,",
        "finalize routes the vault remainder. If quality (sum bps released) hits",
        "the threshold, the surplus stays with the worker; otherwise it returns",
        "to the buyer. Anyone can crank this — outcome is fully determined by",
        "on-chain state."
      ],
      "discriminator": [
        141,
        52,
        35,
        150,
        40,
        6,
        140,
        27
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "Anyone can crank finalize; the outcome is determined by on-chain state."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.buyer",
                "account": "escrow"
              },
              {
                "kind": "account",
                "path": "escrow.nonce",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "worker"
        },
        {
          "name": "workerAta",
          "writable": true
        },
        {
          "name": "buyerAta",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "initializeEscrow",
      "discriminator": [
        243,
        160,
        77,
        153,
        11,
        92,
        48,
        209
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "worker"
        },
        {
          "name": "arbiter"
        },
        {
          "name": "mint"
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "escrow"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "budget",
          "type": "u64"
        },
        {
          "name": "checkpointCount",
          "type": "u8"
        },
        {
          "name": "weights",
          "type": {
            "array": [
              "u16",
              16
            ]
          }
        },
        {
          "name": "deadlineUnix",
          "type": "i64"
        },
        {
          "name": "qualityThresholdBps",
          "type": "u16"
        },
        {
          "name": "specHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "refundBuyer",
      "discriminator": [
        199,
        139,
        203,
        146,
        192,
        150,
        53,
        218
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "account",
                "path": "escrow.nonce",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "buyerAta",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "releaseStreamed",
      "docs": [
        "Streaming-style release. The arbiter posts a per-checkpoint score in",
        "basis points (0..=weight). New release = (score - already_released) for",
        "that checkpoint, scaled by budget. Repeated calls accumulate up to the",
        "checkpoint weight ceiling."
      ],
      "discriminator": [
        182,
        201,
        151,
        59,
        19,
        215,
        34,
        192
      ],
      "accounts": [
        {
          "name": "arbiter",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.buyer",
                "account": "escrow"
              },
              {
                "kind": "account",
                "path": "escrow.nonce",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "worker"
        },
        {
          "name": "workerAta",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "checkpointIndex",
          "type": "u8"
        },
        {
          "name": "scoreBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "setPause",
      "discriminator": [
        63,
        32,
        154,
        2,
        56,
        103,
        79,
        45
      ],
      "accounts": [
        {
          "name": "arbiter",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.buyer",
                "account": "escrow"
              },
              {
                "kind": "account",
                "path": "escrow.nonce",
                "account": "escrow"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "escrow",
      "discriminator": [
        31,
        213,
        123,
        187,
        186,
        22,
        218,
        155
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "badCheckpointCount",
      "msg": "Checkpoint count must be 1..=16"
    },
    {
      "code": 6001,
      "name": "zeroBudget",
      "msg": "Budget must be positive"
    },
    {
      "code": 6002,
      "name": "weightsMustBe10000Bps",
      "msg": "Weights for active checkpoints must sum to 10000 basis points"
    },
    {
      "code": 6003,
      "name": "badThreshold",
      "msg": "Quality threshold must be in 0..=10000 bps"
    },
    {
      "code": 6004,
      "name": "alreadyDeposited",
      "msg": "Escrow already funded"
    },
    {
      "code": 6005,
      "name": "notFunded",
      "msg": "Buyer must fund escrow first"
    },
    {
      "code": 6006,
      "name": "paused",
      "msg": "Streaming is paused"
    },
    {
      "code": 6007,
      "name": "finalized",
      "msg": "Job already finalized"
    },
    {
      "code": 6008,
      "name": "badCheckpointIndex",
      "msg": "Invalid checkpoint index"
    },
    {
      "code": 6009,
      "name": "noForwardProgress",
      "msg": "Score must exceed previously released bps for this checkpoint"
    },
    {
      "code": 6010,
      "name": "unauthorizedArbiter",
      "msg": "Only the designated arbiter may execute this instruction"
    },
    {
      "code": 6011,
      "name": "wrongWorker",
      "msg": "Worker pubkey does not match escrow"
    },
    {
      "code": 6012,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6013,
      "name": "zeroRelease",
      "msg": "Release amount rounded to zero"
    },
    {
      "code": 6014,
      "name": "notRefundable",
      "msg": "Refund only allowed while paused or after deadline"
    },
    {
      "code": 6015,
      "name": "deadlineNotReached",
      "msg": "Cannot finalize before deadline unless fully scored"
    }
  ],
  "types": [
    {
      "name": "escrow",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "worker",
            "type": "pubkey"
          },
          {
            "name": "arbiter",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "budget",
            "type": "u64"
          },
          {
            "name": "released",
            "type": "u64"
          },
          {
            "name": "checkpointCount",
            "type": "u8"
          },
          {
            "name": "weights",
            "type": {
              "array": [
                "u16",
                16
              ]
            }
          },
          {
            "name": "bpsReleasedPerCp",
            "type": {
              "array": [
                "u16",
                16
              ]
            }
          },
          {
            "name": "deposited",
            "type": "bool"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "finalized",
            "type": "bool"
          },
          {
            "name": "deadlineUnix",
            "type": "i64"
          },
          {
            "name": "qualityThresholdBps",
            "type": "u16"
          },
          {
            "name": "specHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    }
  ]
};
