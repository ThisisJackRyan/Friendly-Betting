import React from 'react';
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
import { CSSTransition } from 'react-transition-group';
import CloseX from '../Components/Static/CloseX';
import Hamburger from '../Components/Static/Hamburger';







const ViewBet = () => {

    const [bets, setBets] = useState([])
    const [betId, setBetId] = useState('')
    const [collectionName, setCollectionName] = useState('')

    const [showDeleteAndEditButton, setShowDeleteAndEditButton] = useState(false)
    const [showActions, setShowActions] = useState(false)
    
    
    const bet = useParams();
    



    const handleShowDeleteButton = (createdByID) => {
        createdByID === getSignedInUserInfo().uid ? setShowDeleteAndEditButton(true) : setShowDeleteAndEditButton(false)
    } 
    const handleShowActions = () => {
        setShowActions(!showActions)
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
    <div>
      <div className="flex m-4 mt-8 justify-center">
        <div className='w-full'>
            <div className="flex justify-between border-bottom-dashed-blue-gray">
                <div className="flex items-center text-left px-4 text-2xl md:text-3xl">
                    {bets.bet}
                </div>
                <Hamburger action={handleShowActions} divStyle="pl-2 " IconStyle="text-4xl cursor-pointer"/>
                <CSSTransition
                in={showActions}
                timeout={300}
                classNames="fadeUp"
                unmountOnExit              
                >
                    <div className=' absolute z-10 bg-spring-green-light inset-0 md:inset-y-48 md:inset-x-96 md: rounded-md'>
                    <CloseX action={handleShowActions} divStyle="flex justify-end" IconStyle="text-3xl m-4 cursor-pointer"/>
                        <div className='flex flex-col gap-8 max-w-fit m-auto'>
                            <div className="text-4xl mb-4">
                            <span className='border-bottom'>
                                Actions
                            </span>
                            </div>
                            {showDeleteAndEditButton ?
                                <>  
                                    <DeleteButton collection={collectionName} docId={betId}/> 
                                    <EditButton betUrl={bet} bets={bets} betId={betId} collectionName={collectionName} />
                                </>
                            : null}
                            <ShareButton />
                        </div>
                    </div> 
                </CSSTransition>
            </div>
            <div className='flex justify-center'>
                {collectionName === 'MoneyLineBets' ? <ViewMoneyLine bets={bets} />
                : collectionName === 'OverUnderBets' ? <ViewOverUnder bets={bets} collectionName={collectionName} betId={betId} fetchBet={fetchBet}/>
                : collectionName === 'PropBets' ? <ViewProp bets={bets}/>
                : <div>hmm.... Something went wrong... Wait we are actually loading</div>
                }
            </div>
        </div>
      </div>
    </div>
  );
};

export default ViewBet;
