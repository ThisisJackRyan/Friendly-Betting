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
import { RxHamburgerMenu } from "react-icons/rx";
import { IconContext } from "react-icons";
import { IoCloseOutline } from "react-icons/io5";
import { CSSTransition } from 'react-transition-group';







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
        <div>
                <div className={`flex text-center ${css.betLabel}`}>
                    <div className="x2 flex justify-center items-center text-3xl">
                        {bets.bet}
                    </div>
                    <IconContext.Provider value={{ color: "", className: "text-4xl  cursor-pointer" }}>
                        <div className='pl-2'>
                            <RxHamburgerMenu  onClick={handleShowActions}/>
                        </div>
                    </IconContext.Provider>
                    <CSSTransition
                    in={showActions}
                    timeout={300}
                    classNames="fadeUp"
                    unmountOnExit              
                    >
                        <div className=' absolute z-10 bg-spring-green-light inset-0'>
                            <IconContext.Provider value={{ style: { background: '#ddece0', color:"black" },  className: "text-3xl m-4 cursor-pointer rounded-full black-border" }}>
                                <div className="flex justify-end">
                                    <IoCloseOutline onClick={handleShowActions}/>
                                </div>
                            </IconContext.Provider>
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
                    
                    
                    {/* <div className=' x1 flex gap-4 justify-end'>
                        {showDeleteAndEditButton ?
                            <>  
                                <DeleteButton collection={collectionName} docId={betId}/> 
                                <EditButton betUrl={bet} bets={bets} betId={betId} collectionName={collectionName} />
                            </>
                        : null}
                        <ShareButton />
                        
                    </div> */}
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
