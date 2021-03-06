import { Box, Typography } from "@material-ui/core";
import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  ActionButton,
  ActionButtonWrapper,
} from "../../components/buttons/Buttons";
import { AssetDropdown } from "../../components/dropdowns/AssetDropdown";
import {
  BigTopWrapper,
  BigWrapper,
  CenteringSpacedBox,
  MediumWrapper,
  PaperSpacerWrapper,
} from "../../components/layout/LayoutHelpers";
import {
  ShowEntry,
  SimplePagination,
} from "../../components/pagination/SimplePagination";
import { CenteredProgress } from "../../components/progress/ProgressHelpers";
import {
  TransactionsContent,
  TransactionsHeader,
  TransactionsPaginationWrapper,
  TransactionsStatusHeader,
} from "../../components/transactions/TransactionsGrid";
import { WalletConnectionProgress } from "../../components/wallet/WalletHelpers";
import { db } from "../../services/database/database";
import {
  bridgeChainToRenChain,
  getChainConfig,
  supportedMintDestinationChains,
} from "../../utils/assetConfigs";
import { isFirstVowel } from "../../utils/strings";
import { MintTransactionEntryResolver } from "../mint/components/MintHistoryHelpers";
import { ReleaseTransactionEntryResolver } from "../release/components/ReleaseHistoryHelpers";
import {
  useAuthentication,
  useSelectedChainWallet,
} from "../wallet/walletHooks";
import {
  $wallet,
  setChain,
  setWalletPickerOpened,
} from "../wallet/walletSlice";
import { TransactionHistoryDialog } from "./components/TransactionHistoryHelpers";
import {
  $currentTxId,
  $orderedTransactions,
  $transactionsData,
  $txHistoryOpened,
  BridgeTransaction,
  setTransactions,
  setTxHistoryOpened,
  setTxsPending,
} from "./transactionsSlice";
import { isTransactionCompleted, TxType } from "./transactionsUtils";

export const TransactionHistory: FunctionComponent = () => {
  const dispatch = useDispatch();
  const { account, walletConnected } = useSelectedChainWallet();
  const { isAuthenticated } = useAuthentication();
  const { chain, user } = useSelector($wallet);
  const allTransactions = useSelector($orderedTransactions);
  const { txsPending } = useSelector($transactionsData);
  const opened = useSelector($txHistoryOpened);
  const activeTxId = useSelector($currentTxId);

  useEffect(() => {
    if (!walletConnected) {
      return;
    }
    if (!isAuthenticated) {
      dispatch(setTxsPending(true));
    }
    if (isAuthenticated) {
      db.getTxs(account)
        .then((txsData) => {
          // Only load txs for the correct chain, in case the address is valid on multiple chains
          // (this will happen when using metamask for both bsc and eth)
          dispatch(
            setTransactions(
              (txsData as Array<BridgeTransaction>).filter(
                (x) =>
                  // FIXME: remove the split between "BridgeChain" and "RenChain"
                  x.sourceChain === bridgeChainToRenChain(chain) ||
                  x.destChain === bridgeChainToRenChain(chain)
              )
            )
          );
          dispatch(setTxsPending(false));
        })
        .catch(console.error);
    }
  }, [dispatch, walletConnected, isAuthenticated, user, account, chain]);

  const chainConfig = getChainConfig(chain);
  const handleWalletPickerOpen = useCallback(() => {
    dispatch(setWalletPickerOpened(true));
  }, [dispatch]);

  const handleChainChange = useCallback(
    (event) => {
      dispatch(setChain(event.target.value));
    },
    [dispatch]
  );

  const handleClose = useCallback(() => {
    dispatch(setTxHistoryOpened(false));
  }, [dispatch]);

  const all = allTransactions.length;

  const [page, setPage] = useState(0);
  const handleChangePage = useCallback((event: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const itemsCount = all;
  const itemsPerPage = 4;

  const showTransactions = walletConnected && !txsPending;

  const { pendingTxsCount, completedTxsCount } = useMemo(() => {
    const pendingTxsCount = allTransactions.filter(
      (tx) => !isTransactionCompleted(tx)
    ).length;
    const completedTxsCount = allTransactions.filter((tx) =>
      isTransactionCompleted(tx)
    ).length;
    return { pendingTxsCount, completedTxsCount };
  }, [allTransactions]);

  return (
    <TransactionHistoryDialog
      open={opened}
      onBackdropClick={handleClose}
      keepMounted
    >
      <TransactionsHeader title="Transactions">
        <Box mr={1}>
          <Typography variant="subtitle2">Viewing: </Typography>
        </Box>
        <AssetDropdown
          mode="chain"
          condensed
          available={supportedMintDestinationChains}
          value={chain}
          onChange={handleChainChange}
        />
      </TransactionsHeader>
      {(!walletConnected || txsPending) && (
        <>
          <TransactionsStatusHeader />
          <TransactionsContent>
            <BigTopWrapper>
              {!walletConnected && (
                <>
                  <MediumWrapper>
                    <Typography variant="body1" align="center">
                      Please connect{" "}
                      {isFirstVowel(chainConfig.full) ? "an" : "a"}{" "}
                      {chainConfig.full} compatible wallet to view transactions
                    </Typography>
                  </MediumWrapper>
                  <BigWrapper>
                    <MediumWrapper>
                      <CenteringSpacedBox>
                        <WalletConnectionProgress />
                      </CenteringSpacedBox>
                    </MediumWrapper>
                    <ActionButtonWrapper>
                      <ActionButton onClick={handleWalletPickerOpen}>
                        Connect Wallet
                      </ActionButton>
                    </ActionButtonWrapper>
                  </BigWrapper>
                </>
              )}
              {txsPending && (
                <BigWrapper>
                  <CenteredProgress color="primary" size={100} />
                </BigWrapper>
              )}
            </BigTopWrapper>
          </TransactionsContent>
        </>
      )}
      {showTransactions && (
        <>
          <div>
            {allTransactions.map((tx, index) => {
              const startIndex = page * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const indexIsInCurrentPage =
                index >= startIndex && index < endIndex;

              const isFirstShown = index === startIndex;
              const isPreviousDifferent =
                index > 0 &&
                isTransactionCompleted(tx) &&
                !isTransactionCompleted(allTransactions[index - 1]);
              const showHeader = isFirstShown || isPreviousDifferent;
              const isCurrentCompleted = isTransactionCompleted(tx);
              const title = isCurrentCompleted
                ? `Completed (${completedTxsCount})`
                : `Pending (${pendingTxsCount})`;

              const Header = <TransactionsStatusHeader title={title} />;

              if (tx.type === TxType.MINT) {
                return (
                  <ShowEntry when={indexIsInCurrentPage} key={tx.id}>
                    {showHeader && Header}
                    <MintTransactionEntryResolver
                      tx={tx}
                      isActive={activeTxId === tx.id}
                    />
                  </ShowEntry>
                );
              } else {
                return (
                  <ShowEntry when={indexIsInCurrentPage} key={tx.id}>
                    {showHeader && Header}
                    <ReleaseTransactionEntryResolver
                      tx={tx}
                      isActive={activeTxId === tx.id}
                    />
                  </ShowEntry>
                );
              }
            })}
          </div>
          {allTransactions.length === 0 && (
            <PaperSpacerWrapper>
              <Typography variant="body2" align="center" color="textSecondary">
                You have no transactions with this account.
              </Typography>
            </PaperSpacerWrapper>
          )}
          <TransactionsPaginationWrapper>
            <SimplePagination
              count={itemsCount}
              rowsPerPage={itemsPerPage}
              page={page}
              onChangePage={handleChangePage}
            />
          </TransactionsPaginationWrapper>
        </>
      )}
    </TransactionHistoryDialog>
  );
};
