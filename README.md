# stellar-extended-merge
The Stellar network account merge function will fail if the source account has sub entries; i.e custom assets or offers.
This app fully merges a stellar account, copying all custom assets and offers.

#How it works
Here is a brief algorithm
- Check if source account has custom assets/pending offers(sub-entries)
- If custom assets
  - for each asset:
    - create trustlines for the assets on the destination account
    - transfer funds to destination account
    - remove trustlines from source account
- If offers
  - create matching offer on destination account
  - delete offers on source account
- call regular merge funtion

#Notes
- The transaction fee will be higher because of all the extra operations carried out before the merge
- The secret seed of the destination account is required for this to work
- All operations are grouped into one transaction so if any operation fails the whole merge fails

#Web Page
You can use the application here: [Web Page](https://thor1887.github.io/stellar-extended-merge/)

#Feedback
Comments and suggestions are welcome. Please use the issue tracker for bug reports
