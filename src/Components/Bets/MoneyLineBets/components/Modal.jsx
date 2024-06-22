import React from 'react';
import { IconContext } from "react-icons";
import { IoCloseOutline } from "react-icons/io5";

const Modal = (props) => {

    return (
        <div className='absolute bottom-0 inset-x-0 w-full'>
            <IconContext.Provider value={{ style: { background: '#ddece0', color:"black" },  className: "text-3xl mr-1 mb-1 cursor-pointer rounded-full black-border" }}>
                <div className="flex justify-end">
                    <IoCloseOutline onClick={props.handleModal}/>
                </div>
            </IconContext.Provider>
            <div className='px-4 pb-28 pt-12 bg-spring-green-light'>
                <div className='text-center'>
                    <span className='border-bottom-dashed-blue-gray text-3xl font-medium rou'>Place Your Bet</span>
                </div>
                <div className=' flex flex-col pt-4 gap-6 m-4 text-2xl'>
                    <div className='w-1/2 m-auto'>
                        <button className='baseBetButton w-full rounded-md'>
                            {props.contestant1}
                        </button>
                    </div>
                    <div className='text-center'>or</div>
                    <div className='w-1/2 m-auto'>
                        <button className='baseBetButton  w-full rounded-md'>
                            {props.contestant2}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Modal;