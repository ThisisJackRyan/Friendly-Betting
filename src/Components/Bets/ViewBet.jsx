import React from 'react';
import Players from './Players/Players';
import DeleteButton from '../Components/DeleteButton';
import ShareButton from '../Components/ShareButton';
import EditButton from '../Components/EditButton';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {db} from '../../Config/firebase-config';
import { getDoc, doc } from 'firebase/firestore';
import { getCollectionName } from '../../Config/base';
import css from './Bets.module.css';
import ViewMoneyLine from './MoneyLineBets/ViewMoneyLine';
import ViewOverUnder from './OverUnderBets/ViewOverUnder';
import ViewProp from './PropBets/ViewProp';
import { getSignedInUserInfo } from '../../Config/base';






const ViewBet = () => {

    const [bets, setBets] = useState([])
    const [betId, setBetId] = useState('')
    const [collectionName, setCollectionName] = useState('')

    const [showDeleteAndEditButton, setShowDeleteAndEditButton] = useState(false)
    
    
    const bet = useParams();
    



    const handleShowDeleteButton = (createdByID) => {
        createdByID === getSignedInUserInfo().uid ? setShowDeleteAndEditButton(true) : setShowDeleteAndEditButton(false)
    } 

    const fetchBet = async () => {
        try{
            const betsDocRef = doc(db, "bets", bet.id);
            const betsDocSnap = await getDoc(betsDocRef);
            
            const docRef = doc(db,  getCollectionName(betsDocSnap.data().type), betsDocSnap.data().betID);
            const docSnap = await getDoc(docRef);
            
            handleShowDeleteButton(betsDocSnap.data().createdByID)
            setBets(docSnap.data());
            setBetId(betsDocSnap.data().betID);
            setCollectionName(getCollectionName(betsDocSnap.data().type))
            
        } catch (e) {
            console.error(e);
        }
    }

    

    useEffect(() => {
        fetchBet();
    }, [])




  return (
    <div>
      <div className="flex p-12">
        <div className="x2">
                <div className={`flex text-center p-4 ${css.betLabel}`}>
                    <div className="x2 flex justify-center items-center text-3xl">
                        {bets.bet}
                    </div>
                    <div className=' x1 flex gap-4 justify-end'>
                        {showDeleteAndEditButton ?
                            <>  
                                <DeleteButton collection={collectionName} docId={betId}/> 
                                <EditButton betUrl={bet} bets={bets} betId={betId} collectionName={collectionName} />
                            </>
                        : null}
                        <ShareButton />
                        
                    </div>
                </div>
                {collectionName === 'MoneyLineBets' ? <ViewMoneyLine bets={bets} />
                : collectionName === 'OverUnderBets' ? <ViewOverUnder bets={bets} collectionName={collectionName} betId={betId} fetchBet={fetchBet}/>
                : collectionName === 'PropBets' ? <ViewProp bets={bets}/>
                : <div>hmm.... Something went wrong... Wait we are actually loading</div>
            }
        </div>

      </div>
    </div>
  );
};

export default ViewBet;
