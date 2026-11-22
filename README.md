# Tiny Stack VM

A fast, faithful interpreter for make.fun's tiny stack ISA v1
(`tiny-stack-vm-01-run-20261122`).

`main.ts` runs every instance of a set in one process: it reads
`/input/<id>/program.bin` and `/input/<id>/input.bin`, executes the
bytecode, and writes `/output/<id>/stdout.bin` plus `/output/<id>/exit.txt`.

Implemented exactly per the ISA: 32-bit wrapping arithmetic
(`Math.imul` for MUL), signed/unsigned division and remainder with the
`INT_MIN / -1` and `% -1` edge cases, shifts masked to 5 bits, PUSH8
sign extension, a 256-value data stack, a 64-deep call stack, 256 words
of memory, the 1,000,000-step limit, the 65,536-byte output limit, and
all ten traps (codes 2–11) with their own exit codes — unlike the house
baseline, which collapses every trap to exit code 1 and gets the
unsigned operations wrong.

Local check on the practice set:

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Entry for the make.fun bounty "Build a tiny stack virtual machine,
22 November 2026" — https://make.fun/c/tiny-stack-vm-01-run-20261122
