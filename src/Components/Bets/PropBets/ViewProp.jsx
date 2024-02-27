import React from 'react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Players from '../Players/Players';
import DeleteButton from '../../Components/DeleteButton';
import ShareButton from '../../Components/ShareButton';
import css from './Prop.module.css';
import {db} from '../../../Config/firebase-config';
import { doc, getDoc } from 'firebase/firestore';
const ViewProp = () => {

    const [bets, setBets] = useState([])
    const [length, setLength] = useState(0)
    const [betId, setBetId] = useState('')

    const collectionName = "PropBets"

    const location = useLocation()
    const { bet } = location.state


    useEffect(() => {

        const fetchBet = async () => {
            try{
                const docRef = doc(db, collectionName, bet.betID);
                const docSnap = await getDoc(docRef);
                setBets(docSnap.data());
                setBetId(docSnap.id);
                setLength(docSnap.data().options.length);
            } catch (e) {
                console.error(e);
            }
        }
        fetchBet();
    }, [])


    return (
        <div>
            <div className='flex p-12'>
            <div className='x2'>
                <div>
                    <div className="flex justify-around">
                        <h1 className={css.betLabel} >{bets.bet}</h1>
                        <DeleteButton collection={collectionName} docId={betId} />  
                        <ShareButton />
                    </div>
                   
                   {length > 0 ? (
                        <div>
                            <h4><span>Betting</span></h4> 
                            <div className="pl-8">
                                {bets.options.map((option, index) => (
                                    <div key={index}>
                                        <p>{option}</p>
                                    </div>
                                )
                                )}
                            </div>
                        </div>
                    ): (null)}
                </div>
            </div>
            <div className="x1">
                <Players />
            </div>
            
        </div>
        </div>
    );
};

export default ViewProp;
