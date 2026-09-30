import React from 'react';
import DeleteButton from '../Components/DeleteButton';
import ShareButton from '../Components/ShareButton';
import EditButton from '../Components/EditButton';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {db} from '../../Config/firebase-config';
import { getDoc, doc } from 'firebase/firestore';
import { getCollectionName, getSignedInUserInfo } from '../../Config/base';
import ViewMoneyLine from './MoneyLineBets/ViewMoneyLine';
import ViewOverUnder from './OverUnderBets/ViewOverUnder';
import ViewProp from './PropBets/ViewProp';







const ViewBet = () => {

    const [bets, setBets] = useState([])
    const [betId, setBetId] = useState('')
    const [collectionName, setCollectionName] = useState('')

    const [showDeleteAndEditButton, setShowDeleteAndEditButton] = useState(false)
    
    
    const bet = useParams();
    



    const handleShowDeleteButton = (createdByID) => {
        const user = getSignedInUserInfo();
        setShowDeleteAndEditButton(!!user && createdByID === user.uid);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])




  return (
    <div className="pb-10 pt-2">
        <h1 className="text-2xl font-medium">{bets.bet}</h1>
        <div className="mt-4">
            <ShareButton title={bets.bet || 'Friendly bet'} text={bets.bet} />
        </div>
        <div className="mt-2">
            {collectionName === 'MoneyLineBets' ? <ViewMoneyLine bets={bets} />
            : collectionName === 'OverUnderBets' ? <ViewOverUnder bets={bets} collectionName={collectionName} betId={betId} fetchBet={fetchBet}/>
            : collectionName === 'PropBets' ? <ViewProp bets={bets}/>
            : <div>Loading…</div>
            }
        </div>
        {showDeleteAndEditButton ? (
            <div className="mt-8 flex flex-col gap-3">
                <EditButton betUrl={bet} bets={bets} collectionName={collectionName} />
                <DeleteButton collection={collectionName} docId={betId} />
            </div>
        ) : null}
    </div>
  );
};

export default ViewBet;
