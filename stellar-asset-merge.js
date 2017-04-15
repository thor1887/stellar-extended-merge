jQuery(document).ready( function($){
  var testNet = "https://horizon-testnet.stellar.org";
  var liveNet = "https://horizon.stellar.org";
  var statusMsg = "Merging accounts...\n";
  var server = "";
  var srcBalances = [];
  var srcOffers = [];
  var srcData = {};
  var srcSubEntryCount = 0;
  var customAsset = false;
  var destToSign = 0;

  // display srcSeed form 
  $("[name='customAsset']").on('change', function() {
    if (this.checked) {
      var destSeedInput = `<label for="destSeed" class="sr-only">Destination Seed: </label>
        <input type="text" name="destSeed" class="form-control" placeholder="Enter Destination Account Seed" required/>
        <small>If the source account has custom assets, then the seed of the destination account is required</small>
        `;
      
      $("#destSeed").html(destSeedInput);
      customAsset = true;
    }

    if(!this.checked){
      
      $("#destSeed").html(' ');
      customAsset = false;

    }

  });


 $("#account-merge-form" ).submit(function( event ) {
 
    
    event.preventDefault();
    $('#statusMsg').html(' ');
    statusMsg = "";
    statusMsg += "<p>Merging accounts...</p>";
    statusMsg += "<p>Checking values...</p>";
    $('#statusMsg').html(statusMsg);
    var networkType = $("[name='network']:checked").val();
    var srcAccount = $("[name='srcAccount']").val();
    var srcSeed = $("[name='srcSeed']").val();
    var destAccount = $("[name='destAccount']").val();
    var destSeed = $("[name='destSeed']").val();
    
    var srcKeypair = "";
    var destKeypair = "";

    // Validate Inputs
    if (networkType == 1) {
      StellarSdk.Network.useTestNetwork();
      server = new StellarSdk.Server(testNet);
    } else if (networkType == 2) {
      StellarSdk.Network.usePublicNetwork();
      server = new StellarSdk.Server(liveNet);
    }
    else
    {
      // need to select network type
      alert("You need to select network type");
      return null;
    }

    try{
      srcKeypair = StellarSdk.Keypair.fromSeed(srcSeed);
      
    }
    catch(error){
      srcKeypair = false;
      statusMsg += "<p>Invalid Source Seed</p>";
      $('#statusMsg').html(statusMsg);
      return null;
    }

    

    if (!StellarSdk.Keypair.isValidPublicKey(srcAccount) || !srcKeypair || srcKeypair.accountId() != srcAccount)
    {
        statusMsg += "<p>Source Account Keypairs Invalid...</p>";
        $('#statusMsg').html(statusMsg);
        return null;
    }

    if (customAsset) {
      console.log("checking custom asset");
      try{
          destKeypair = StellarSdk.Keypair.fromSeed(destSeed);
          
      }
      catch(error){
          destKeypair = false;
          statusMsg += "<p>Invalid Destination Seed</p>";
          $('#statusMsg').html(statusMsg);
          return null;
      }

      if (!StellarSdk.Keypair.isValidPublicKey(destAccount) || !destKeypair || destKeypair.accountId() != destAccount)
      {
        statusMsg += "<p>Destination Account Keypairs Invalid...</p>";
        $('#statusMsg').html(statusMsg);
        return null;
      }
    }

    if (!customAsset) {
      console.log(" not checking custom asset");
      if (!StellarSdk.Keypair.isValidPublicKey(destAccount)) {

        statusMsg += "<p>Destination Account Key Invalid...</p>";
        $('#statusMsg').html(statusMsg);
        return null;
      }
    }

    // algorithm for merge
    // load source account and check for custom assets
    // if none do normal merge
    // if custom assets, then foreach asset,
    // create trustline from destination to asset issuer
    // send custom asset from source to destination
    // end for
    // do normal merge

    var newTx = "";
    // load source account
    server.loadAccount(srcAccount)
      .catch(StellarSdk.NotFoundError, function(error) {
      
        statusMsg += "<p>Destination Account Not Active...</p>";
        $('#statusMsg').html(statusMsg);
        return null;
        // throw new Error("Destination not active");
      })
      .then(function(acct) {
        newTx = new StellarSdk.TransactionBuilder(acct);
        srcBalances = acct.balances;
        srcData = acct.data_attr;
        srcSubEntryCount = acct.subentry_count;
        
        console.log("srcBalances: ", srcBalances, "\n length", srcBalances.length);
        if (acct.subentry_count > 0 && !customAsset) {
          statusMsg += "<p>Source accounts has sub entries. Destination account seed is required. Please select the custom asset checkbox.</p>";
          $('#statusMsg').html(statusMsg);
          throw new Error("Destination seed required");
        } else{
          
          // check for pending offers
          return server.offers('accounts', srcAccount).call();          
        };

      })
      .then(function(offers) {
        srcOffers = offers.records;
        console.log("Offers: ", srcOffers);
      })
      .then(function() {
        if (srcBalances.length > 1) {
          // transfer custom assets before merger
          
          // add custom assets to operation
          srcBalances.forEach(function(balance) {
            if (balance.asset_type != 'native') {
              var asset = new StellarSdk.Asset(balance.asset_code, balance.asset_issuer);
              // create trustline
              // transfer balance
              // remove trust line
              //check if destination is not the owner of asset. 
              if (balance.asset_issuer != destAccount) {
                newTx = newTx.addOperation(StellarSdk.Operation.changeTrust({
                            asset: asset,
                            limit: balance.limit,
                            source: destAccount
                          }));
                destToSign = 1;
              }
              
              if (parseFloat(balance.balance) > 0) {
                newTx = newTx.addOperation(StellarSdk.Operation.payment({
                            destination: destAccount,
                            asset: asset,
                            amount: balance.balance,
                            source: srcAccount
                          }));
              }
                          
              newTx = newTx.addOperation(StellarSdk.Operation.changeTrust({
                            asset: asset,
                            limit: "0",
                            source: srcAccount
                          }));
            }
          });

         

        }

        if (srcOffers.length > 0) {
          // create new offer at destination
          // delete old offer at source
          srcOffers.forEach(function(offer) {
            var toSell = "";
            if ( offer.selling.asset_type === 'native') {
              toSell = StellarSdk.Asset.native();
            } else{
              toSell = new StellarSdk.Asset(offer.selling.asset_code, offer.selling.asset_issuer);
            };

            var toBuy = "";
            if ( offer.buying.asset_type === 'native') {
              toBuy = StellarSdk.Asset.native();
            } else{
              toBuy = new StellarSdk.Asset(offer.buying.asset_code, offer.buying.asset_issuer);
            };
  
            newTx = newTx.addOperation(StellarSdk.Operation.manageOffer({
                            selling: toSell,
                            buying: toBuy,
                            amount: offer.amount,
                            price: offer.price,
                            offerId: "0",
                            source: destAccount
                          }))
                          .addOperation(StellarSdk.Operation.manageOffer({
                            selling: toSell,
                            buying: toBuy,
                            amount: "0",
                            price: offer.price,
                            offerId: offer.id,
                            source: srcAccount
                          }));
            destToSign = 1;

          });
        }

        // move data to dest account

        if (!jQuery.isEmptyObject(srcData)) {

          // create new data at destination
          // delete old data at source
         for (var item in srcData) {

          console.log(item);

              newTx = newTx.addOperation(StellarSdk.Operation.manageData({
                            name: item,
                            value: srcData[item],
                            source: destAccount
                          }))
                          .addOperation(StellarSdk.Operation.manageData({
                            name: item,
                            value: null,
                            source: srcAccount
                          }));
          }
          destToSign = 1;
        }
        

        // account merge the stellar way
        newTx = newTx.addOperation(StellarSdk.Operation.accountMerge({
                            destination: destAccount
                          }));

        console.log("newTx", newTx);
        newTx = newTx.build();
        console.log("newTx", newTx);
        newTx.sign(srcKeypair);
        // if the destination seed was entered 
        // and the source account has more than 1 currency
        if (destKeypair && srcSubEntryCount > 0 && destToSign > 0) {
          console.log("destination Keypair signing");
          newTx.sign(destKeypair);

        }else{
          console.log("destKeypair", destKeypair);
          console.log("sb length", srcBalances.length);
        }
        console.log("newTx signed", newTx);
        return server.submitTransaction(newTx);

      })
      .then(function(result) {
        console.log('Tx Success! Results:', result);
        statusMsg +='<p>Transaction Successful</p>';
        $('#statusMsg').html(statusMsg);
        
        
      })
      .catch(function(error) {
        console.error('Tx Error\n', error);
        statusMsg += '<p>Transaction Failed.</p>';
        $('#statusMsg').html(statusMsg);
        
      });
  

 
  });


});