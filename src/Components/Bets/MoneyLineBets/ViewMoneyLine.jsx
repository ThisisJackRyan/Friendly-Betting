import React from 'react';
import Modal from './components/Modal';
import { CSSTransition } from 'react-transition-group';
import { useState } from 'react';


const ViewMoneyLine = ({bets}) => {
    const [displayModal, setDisplayModal] = useState(false);

    const handleModal = () => {
        setDisplayModal(!displayModal);
    }
    return (     
        <div className="">
            <div className='blob'>
                <div className='flex flex-col gap-4 text-center text-2xl'>
                    <div>
                        <div>
                            {bets.contestant1}
                        </div>
                        {
                            bets.favorite === bets.contestant1 ? <span className='text-sm'>* Favorite according to the creator</span> : null
                        }
                    </div>
                    <div className='text-lg'>or</div>
                    <div>
                        <div>
                            {bets.contestant2}
                        </div>
                        {
                            bets.favorite === bets.contestant2 ? <span className='text-sm'>* Favorite according to the creator</span> : null
                        }
                        
                    </div>
                    <div className='flex justify-center mt-6'>
                        <button className='betButton  rounded-md cursor-pointer' onClick={handleModal}>Place Bet</button>
                    </div>  
                </div>
            </div>

            <CSSTransition
                in={displayModal}
                timeout={300}
                classNames="fadeUp"
                unmountOnExit              
            >
                <Modal handleModal={handleModal} contestant1={bets.contestant1} contestant2={bets.contestant2}/>
            </CSSTransition>
        </div> 
    );
};

export default ViewMoneyLine;
